#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum PaddingKind {
    All,
    X,
    Y,
    Top,
    Right,
    Bottom,
    Left,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum UtilityKind {
    BackgroundColor,
    TextColor,
    ImageColor,
    PlaceholderColor,
    Radius,
    ZIndex,
    Padding(PaddingKind),
    Gap,
    Width,
    Height,
    Size,
    Unknown,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct ParsedUtility {
    pub(crate) raw: String,
    pub(crate) family: String,
    pub(crate) payload: Option<String>,
    pub(crate) kind: UtilityKind,
}

impl UtilityKind {
    pub(crate) fn needs_config_lookup(&self) -> bool {
        matches!(
            self,
            UtilityKind::BackgroundColor
                | UtilityKind::TextColor
                | UtilityKind::ImageColor
                | UtilityKind::PlaceholderColor
                | UtilityKind::Radius
                | UtilityKind::Padding(_)
                | UtilityKind::Gap
                | UtilityKind::Width
                | UtilityKind::Height
                | UtilityKind::Size
        )
    }

    pub(crate) fn is_supported(&self) -> bool {
        !matches!(self, UtilityKind::Unknown)
    }
}

pub(crate) fn parse_utility(token: &str) -> ParsedUtility {
    if token.starts_with("-z-") {
        return ParsedUtility {
            raw: token.to_owned(),
            family: "z".to_owned(),
            payload: token.strip_prefix("-z-").map(|value| value.to_owned()),
            kind: UtilityKind::ZIndex,
        };
    }

    for (prefix, kind) in [
        ("bg-", UtilityKind::BackgroundColor),
        ("text-", UtilityKind::TextColor),
        ("image-", UtilityKind::ImageColor),
        ("placeholder-", UtilityKind::PlaceholderColor),
        ("rounded-", UtilityKind::Radius),
        ("z-", UtilityKind::ZIndex),
        ("p-", UtilityKind::Padding(PaddingKind::All)),
        ("px-", UtilityKind::Padding(PaddingKind::X)),
        ("py-", UtilityKind::Padding(PaddingKind::Y)),
        ("pt-", UtilityKind::Padding(PaddingKind::Top)),
        ("pr-", UtilityKind::Padding(PaddingKind::Right)),
        ("pb-", UtilityKind::Padding(PaddingKind::Bottom)),
        ("pl-", UtilityKind::Padding(PaddingKind::Left)),
        ("gap-", UtilityKind::Gap),
        ("w-", UtilityKind::Width),
        ("h-", UtilityKind::Height),
        ("size-", UtilityKind::Size),
    ] {
        if let Some(payload) = token.strip_prefix(prefix) {
            return ParsedUtility {
                raw: token.to_owned(),
                family: prefix.trim_end_matches('-').to_owned(),
                payload: Some(payload.to_owned()),
                kind,
            };
        }
    }

    ParsedUtility {
        raw: token.to_owned(),
        family: token
            .split_once('-')
            .map(|(family, _)| family)
            .unwrap_or(token)
            .to_owned(),
        payload: token.split_once('-').map(|(_, payload)| payload.to_owned()),
        kind: UtilityKind::Unknown,
    }
}
