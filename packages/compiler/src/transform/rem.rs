use crate::ir::model::{HelperEntry, PropEntry};

pub(crate) const REM_NAMESPACE: &str = "__VelaRem";

/// Props whose numbers are pixel offsets, mirroring the runtime's own table. A
/// utility writes plenty of numbers rem must not touch — `UIGradient.Offset` is
/// normalized, `UIScale.Scale` is a multiplier, `ZIndex` is an order.
const SCALED_PROPS: [&str; 33] = [
    "BlurRadius",
    "BottomLeftRadius",
    "BottomRightRadius",
    "CellPadding",
    "CellSize",
    "CornerRadius",
    "GapOffset",
    "GridCrossExtent",
    "MaxHeight",
    "MaxSize",
    "MaxWidth",
    "MinHeight",
    "MinSize",
    "MinWidth",
    "Padding",
    "PaddingBottom",
    "PaddingLeft",
    "PaddingRight",
    "PaddingTop",
    "Position",
    "PositionX",
    "PositionY",
    "ScrollBarThickness",
    "Size",
    "SizeX",
    "SizeY",
    "Spread",
    "TextSize",
    "Thickness",
    "TopLeftRadius",
    "TopRightRadius",
    "TranslateX",
    "TranslateY",
];

pub(crate) fn scales_prop(name: &str) -> bool {
    SCALED_PROPS.contains(&name)
}

fn scales_helper_prop(tag: &str, name: &str) -> bool {
    scales_prop(name) || (tag == "uishadow" && name == "Offset")
}

/// Roblox stops honoring `TextSize` past 100, so that one prop takes a scale
/// that caps rather than the plain one.
const TEXT_SIZE_PROP: &str = "TextSize";

/// The offsets among a runtime host's own props, named for the host to scale
/// rather than wrapped, since it re-renders on a rem change of its own accord.
pub(crate) fn scaled_prop_names(props: &[PropEntry]) -> Vec<String> {
    props
        .iter()
        .filter(|prop| scales_prop(&prop.name) && carries_offset(&prop.value))
        .map(|prop| prop.name.to_string())
        .collect()
}

/// A statically lowered element has no render of its own to run again when the
/// viewport changes, so its offsets leave as a binding the runtime can write
/// through instead of as a value. Built inline in the JSX that binding would be
/// a new one on every render, and a new one is a fresh subscription for the
/// reconciler, so each call site is handed a slot the runtime builds once.
#[derive(Default)]
pub(crate) struct RemScaler {
    slots: usize,
    /// Whether anything was wrapped, since only a file that scales at least one
    /// offset needs the namespace inlined above it.
    pub(crate) used: bool,
}

impl RemScaler {
    pub(crate) fn prop(&mut self, prop: PropEntry) -> PropEntry {
        self.maybe_scale(prop, scales_prop)
    }

    fn helper_prop(&mut self, tag: &str, prop: PropEntry) -> PropEntry {
        self.maybe_scale(prop, |name| scales_helper_prop(tag, name))
    }

    fn maybe_scale(
        &mut self,
        prop: PropEntry,
        should_scale: impl FnOnce(&str) -> bool,
    ) -> PropEntry {
        if !should_scale(&prop.name) || !carries_offset(&prop.value) {
            return prop;
        }

        self.used = true;

        PropEntry {
            value: self.expression(&prop.name, &prop.value),
            name: prop.name,
        }
    }

    pub(crate) fn helper(&mut self, helper: HelperEntry) -> HelperEntry {
        let tag = helper.tag;
        HelperEntry {
            tag,
            props: helper
                .props
                .into_iter()
                .map(|prop| self.helper_prop(tag, prop))
                .collect(),
        }
    }

    fn expression(&mut self, name: &str, value: &str) -> String {
        let method = if name == TEXT_SIZE_PROP {
            "scaleText"
        } else {
            "scale"
        };
        let slot = self.slots;
        self.slots += 1;

        format!("{REM_NAMESPACE}.{method}({value}, {slot})")
    }
}

/// Whether the value has an offset rem could move. `w-full` and `top-1/2` are
/// pure scale, and wrapping those would cost a binding to multiply zero.
fn carries_offset(value: &str) -> bool {
    let Some((constructor, arguments)) = split_call(value) else {
        return value.parse::<f64>() != Ok(0.0);
    };

    // An unparsed argument is something like `math.huge`, which only ever
    // reaches a prop that is an offset to begin with.
    let is_offset = |index: usize| match arguments.get(index) {
        Some(argument) => argument.parse::<f64>() != Ok(0.0),
        None => false,
    };

    match constructor {
        "UDim2.fromScale" => false,
        "new UDim2" => is_offset(1) || is_offset(3),
        "new UDim" => is_offset(1),
        "UDim2.fromOffset" | "new Vector2" => (0..arguments.len()).any(is_offset),
        _ => true,
    }
}

/// Splits `new UDim2(1, 0, 0, 16)` into its callee and its arguments. Only the
/// flat literal calls this crate emits are recognized; anything nested returns
/// `None` and is scaled on the assumption that it carries an offset.
fn split_call(value: &str) -> Option<(&str, Vec<&str>)> {
    let open = value.find('(')?;
    let arguments = value.strip_suffix(')')?.get(open + 1..)?;

    if arguments.contains('(') {
        return None;
    }

    Some((
        value[..open].trim(),
        arguments.split(',').map(str::trim).collect(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_offsets_are_worth_a_binding() {
        assert!(carries_offset("UDim2.fromOffset(8, 8)"));
        assert!(carries_offset("new UDim2(1, 0, 0, 16)"));
        assert!(carries_offset("new UDim(0, 16)"));
        assert!(carries_offset("new Vector2(math.huge, 0)"));
        assert!(carries_offset("12"));

        assert!(!carries_offset("UDim2.fromScale(1, 1)"));
        assert!(!carries_offset("UDim2.fromOffset(0, 0)"));
        assert!(!carries_offset("new UDim2(0.5, 0, 1, 0)"));
        assert!(!carries_offset("new UDim(0.5, 0)"));
        assert!(!carries_offset("0"));
    }

    #[test]
    fn an_unrecognized_expression_is_assumed_to_carry_one() {
        assert!(carries_offset("theme.spacing(4)"));
        assert!(carries_offset("new UDim2(0, computeOffset(), 0, 0)"));
    }

    fn scale_prop(prop: PropEntry) -> (PropEntry, bool) {
        let mut scaler = RemScaler::default();
        let prop = scaler.prop(prop);

        (prop, scaler.used)
    }

    #[test]
    fn a_prop_that_is_not_an_offset_is_left_alone() {
        let (prop, scaled) = scale_prop(PropEntry {
            name: "ZIndex".into(),
            value: "3".to_owned(),
        });

        assert_eq!(prop.value, "3");
        assert!(!scaled);
    }

    #[test]
    fn a_text_size_takes_the_scale_that_caps() {
        let (prop, scaled) = scale_prop(PropEntry {
            name: "TextSize".into(),
            value: "60".to_owned(),
        });

        assert_eq!(prop.value, "__VelaRem.scaleText(60, 0)");
        assert!(scaled);
    }

    #[test]
    fn an_offset_prop_leaves_as_a_binding() {
        let (prop, scaled) = scale_prop(PropEntry {
            name: "Size".into(),
            value: "UDim2.fromOffset(8, 8)".to_owned(),
        });

        assert_eq!(prop.value, "__VelaRem.scale(UDim2.fromOffset(8, 8), 0)");
        assert!(scaled);
    }

    #[test]
    fn only_a_shadow_helper_scales_offset() {
        let offset = || PropEntry {
            name: "Offset".into(),
            value: "UDim2.fromOffset(0, 8)".to_owned(),
        };
        let mut scaler = RemScaler::default();
        let shadow = scaler.helper(HelperEntry {
            tag: "uishadow",
            props: vec![offset()],
        });
        let gradient = scaler.helper(HelperEntry {
            tag: "uigradient",
            props: vec![offset()],
        });

        assert_eq!(
            shadow.props[0].value,
            "__VelaRem.scale(UDim2.fromOffset(0, 8), 0)"
        );
        assert_eq!(gradient.props[0].value, "UDim2.fromOffset(0, 8)");
    }

    /// A slot is what keeps two offsets in one file from sharing a binding, so
    /// each wrap has to take the next one and a skipped prop has to take none.
    #[test]
    fn every_wrapped_offset_takes_its_own_slot() {
        let mut scaler = RemScaler::default();
        let wrap = |scaler: &mut RemScaler, name: &'static str, value: &str| {
            scaler
                .prop(PropEntry {
                    name: name.into(),
                    value: value.to_owned(),
                })
                .value
        };

        assert_eq!(
            wrap(&mut scaler, "Size", "UDim2.fromOffset(8, 8)"),
            "__VelaRem.scale(UDim2.fromOffset(8, 8), 0)"
        );
        assert_eq!(wrap(&mut scaler, "ZIndex", "3"), "3");
        assert_eq!(
            wrap(&mut scaler, "Size", "UDim2.fromOffset(8, 8)"),
            "__VelaRem.scale(UDim2.fromOffset(8, 8), 1)"
        );
    }
}
