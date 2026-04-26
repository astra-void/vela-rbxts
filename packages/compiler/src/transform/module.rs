use swc_core::ecma::ast::{JSXAttrName, JSXElementName, ModuleItem};

pub(crate) fn create_runtime_host_module_items(
    config: &crate::config::model::TailwindConfig,
) -> Vec<ModuleItem> {
    crate::transform::runtime_host::create_runtime_host_module_items(config)
}

pub(crate) fn element_tag_name(name: &JSXElementName) -> String {
    match name {
        JSXElementName::Ident(ident) => ident.sym.to_string(),
        _ => "frame".to_owned(),
    }
}

pub(crate) fn is_class_name_attr(name: &JSXAttrName) -> bool {
    matches!(name, JSXAttrName::Ident(ident) if ident.sym == "className")
}

pub(crate) fn is_supported_host_element(name: &JSXElementName) -> bool {
    matches!(
        name,
        JSXElementName::Ident(ident)
            if matches!(
                ident.sym.as_ref(),
                "frame"
                    | "scrollingframe"
                    | "canvasgroup"
                    | "textlabel"
                    | "textbutton"
                    | "textbox"
                    | "imagelabel"
                    | "imagebutton"
            )
    )
}
