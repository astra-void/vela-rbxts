pub(crate) mod react;
pub(crate) mod vide;

use crate::config::model::TailwindConfig;
use crate::transform::runtime_host::RuntimeNeeds;
use swc_core::ecma::ast::{
    Expr, JSXAttrOrSpread, JSXElement, JSXElementChild, JSXElementName, ModuleItem,
};

/// What the IR to JSX bake has to spell differently per UI library. Everything
/// above it — tokenization, utility resolution, the style IR — is shared, and
/// so is every prop and helper child the static path writes: Vide reads the
/// same lowercase host tags and the same Roblox property names React does.
///
/// Only the reactive seams diverge, because Vide has no re-render.
pub(crate) trait EmitTarget {
    /// The preamble a transformed module opens with: the runtime import, and
    /// whatever the file needs constructed out of it.
    fn runtime_module_items(
        &self,
        config: &TailwindConfig,
        needs: &RuntimeNeeds<'_>,
    ) -> Vec<ModuleItem>;

    /// The binding `runtime_module_items` declared for the runtime host, which
    /// is what a lowered element is retagged to.
    fn host_element_name(&self) -> &'static str;

    /// Whether a class value reaches the host deferred. Vide has no re-render,
    /// so a dynamic one is written as a thunk — which the collapser has to look
    /// inside before it can read any of it, and put back if anything is left.
    fn class_value_is_deferred(&self) -> bool;

    /// Whether the host has to be told that a margin may arrive before the
    /// element exists. React re-renders and can wrap whenever one does; Vide
    /// builds its tree bottom-up, and the box a margin needs is an instance
    /// above one that is already parented.
    fn needs_margin_box_hint(&self) -> bool;

    /// The expressions the emitted branch rules decide on, as one attribute the
    /// host reads by index.
    fn tests_attr(&self, tests: Vec<Expr>) -> JSXAttrOrSpread;

    /// The runtime's opacity provider, wrapped around what the static fade
    /// could not reach.
    fn opacity_provider(&self, alpha: f64, children: Vec<JSXElementChild>) -> Box<JSXElement>;

    /// What a provider's child has to look like by the time it is placed. React
    /// reads the context during the child's own render, so the child travels as
    /// it is; Vide builds a child eagerly, before the provider that would have
    /// scoped it ever runs, so it travels as a thunk instead.
    fn provider_child(&self, child: JSXElementChild) -> JSXElementChild;

    /// The runtime's pin provider, wrapped around what a pinning container
    /// holds. Everything below it reads its offsets as literal pixels.
    fn pin_provider(&self, children: Vec<JSXElementChild>) -> Box<JSXElement>;

    /// The runtime's boundary consumer, wrapped around what a component
    /// returns. It reads what reached this component as context rather than as
    /// something the transformer could compose into the emit: an inherited
    /// fade, and the pin a container opened above the file this pass compiled.
    fn boundary_element(&self, child: Expr) -> Box<JSXElement>;

    /// The name a helper child is written with when its lowercase tag would not
    /// reach the right Roblox class, or `None` to write the tag as is.
    fn helper_element_name(&self, tag: &'static str) -> Option<JSXElementName>;
}

pub(crate) fn react_target() -> &'static dyn EmitTarget {
    static TARGET: react::ReactTarget = react::ReactTarget;
    &TARGET
}

pub(crate) fn vide_target() -> &'static dyn EmitTarget {
    static TARGET: vide::VideTarget = vide::VideTarget;
    &TARGET
}

pub(crate) fn target_for(framework: crate::config::model::Framework) -> &'static dyn EmitTarget {
    match framework {
        crate::config::model::Framework::React => react_target(),
        crate::config::model::Framework::Vide => vide_target(),
    }
}
