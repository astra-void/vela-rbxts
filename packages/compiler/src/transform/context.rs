use crate::api::Diagnostic;
use crate::class_value::collapse::collapse_class_value_expr;
use crate::class_value::scope::ClassValueScopeStack;
use crate::diagnostics::compiler::{
    decoration_on_richtext_diagnostic, divide_unreadable_order_diagnostic,
    divide_with_grid_diagnostic, divide_without_list_layout_diagnostic,
    isolate_needs_frame_diagnostic, isolate_not_static_diagnostic, motion_on_component_diagnostic,
};
use crate::ir::model::{PropEntry, StyleIr, TextSpec};
use crate::semantic::plugin::{ExpandedToken, expand_class_token};
use crate::semantic::utility::{UtilityKind, parse_utility};
use crate::swc::builders::{
    create_helper_child, create_helper_child_cast_any, create_prop_attr, create_prop_attr_cast_any,
    helper_tag_name, inherit_child_span, inherit_span,
};
use crate::transform::boundary::{
    consume_component_function, consume_component_initializer, is_component_binding,
};
use crate::transform::jsx::{
    attach_token_ranges, declared_prop_names, element_display_name, element_expression_source,
    is_component_element, lower_class_name, unsupported_host_class_name_diagnostic,
};
use crate::transform::module::{RuntimeNeeds, element_tag_name, is_supported_host_element};
use crate::transform::opacity::{
    branch_opacity_needs_runtime, compose_inherited_opacity, opacity_alpha_entry,
    static_opacity_alpha,
};
use swc_core::{
    common::DUMMY_SP,
    ecma::ast::{
        BlockStmt, DefaultDecl, ExportDefaultDecl, ExportDefaultExpr, Expr, FnDecl, Ident, JSXAttr,
        JSXAttrName, JSXAttrOrSpread, JSXAttrValue, JSXClosingElement, JSXElement, JSXElementChild,
        JSXElementName, JSXEmptyExpr, JSXExpr, JSXExprContainer, JSXFragment, Module, Pat, Str,
        TplElement, VarDecl, VarDeclKind, VarDeclarator,
    },
    ecma::visit::{Visit, VisitMut, VisitMutWith, VisitWith},
};

pub(crate) struct VelaTransformer {
    pub(crate) changed: bool,
    pub(crate) config: crate::config::model::TailwindConfig,
    /// Which UI library this file is baked for. Everything the semantic layer
    /// decided is target-neutral; only what reaches JSX goes through here.
    pub(crate) target: &'static dyn crate::transform::target::EmitTarget,
    pub(crate) diagnostics: Vec<Diagnostic>,
    pub(crate) ir: Vec<StyleIr>,
    pub(crate) runtime_host_needed: bool,
    /// Whether any host in this file is handed a class value to parse, which is
    /// the only thing the inlined config's theme scales are read for.
    pub(crate) resolves_class_values: bool,
    /// Whether a fade left the static path and needs the runtime's opacity
    /// helpers, which a file can need without needing the whole host.
    pub(crate) opacity_helper_needed: bool,
    /// Whether anything in this file reads what crossed a component boundary:
    /// the consumer every component root carries, and the pin a `SurfaceGui`
    /// opens over a subtree this pass cannot see all of.
    pub(crate) boundary_helper_needed: bool,
    /// Whether a helper child was named through the runtime's class names.
    pub(crate) helper_namespace_needed: bool,
    /// Whether a statically lowered offset left as a rem binding, which needs
    /// the rem namespace the same way, and the slots those bindings took.
    pub(crate) rem: crate::transform::rem::RemScaler,
    pub(crate) class_value_scopes: ClassValueScopeStack,
    /// The alpha every enclosing `opacity-*` has left for this element. 1 is
    /// opaque, and the root starts there.
    pub(crate) opacity_alpha: f64,
    /// Whether an enclosing container pins this element's offsets to literal
    /// pixels. A `SurfaceGui` is drawn on a part rather than on the screen, so
    /// the viewport the rem curve follows says nothing about it.
    pub(crate) rem_pinned: bool,
}

impl VisitMut for VelaTransformer {
    fn visit_mut_module(&mut self, module: &mut Module) {
        self.class_value_scopes.push();
        module.visit_mut_children_with(self);
        self.class_value_scopes.pop();

        let mut runtime_items = self.target.runtime_module_items(
            &self.config,
            &RuntimeNeeds {
                host: self.runtime_host_needed,
                resolves_class_values: self.resolves_class_values,
                rem: self.rem.used.then_some(&self.config.theme.rem),
                opacity: self.opacity_helper_needed,
                boundary: self.boundary_helper_needed,
                helper_namespace: self.helper_namespace_needed,
            },
        );

        if !runtime_items.is_empty() {
            runtime_items.append(&mut module.body);
            module.body = runtime_items;
        }
    }

    fn visit_mut_block_stmt(&mut self, block: &mut BlockStmt) {
        self.class_value_scopes.push();
        block.visit_mut_children_with(self);
        self.class_value_scopes.pop();
    }

    // A component defined here is rendered from somewhere this pass cannot see,
    // so what reaches it arrives as context. Its root is where that is read, and
    // the instances it lowered statically are corrected from there.
    fn visit_mut_fn_decl(&mut self, declaration: &mut FnDecl) {
        declaration.visit_mut_children_with(self);

        if is_component_binding(&declaration.ident.sym)
            && consume_component_function(&mut declaration.function, self.target)
        {
            self.boundary_helper_needed = true;
            self.changed = true;
        }
    }

    fn visit_mut_export_default_decl(&mut self, declaration: &mut ExportDefaultDecl) {
        declaration.visit_mut_children_with(self);

        let DefaultDecl::Fn(function) = &mut declaration.decl else {
            return;
        };
        if consume_component_function(&mut function.function, self.target) {
            self.boundary_helper_needed = true;
            self.changed = true;
        }
    }

    // `export default (props) => …` names nothing for the rule above to read,
    // and it is a component all the same.
    fn visit_mut_export_default_expr(&mut self, expr: &mut ExportDefaultExpr) {
        expr.visit_mut_children_with(self);

        if consume_component_initializer(&mut expr.expr, self.target) {
            self.boundary_helper_needed = true;
            self.changed = true;
        }
    }

    fn visit_mut_var_declarator(&mut self, declarator: &mut VarDeclarator) {
        declarator.visit_mut_children_with(self);

        let Pat::Ident(binding) = &declarator.name else {
            return;
        };
        if !is_component_binding(&binding.id.sym) {
            return;
        }

        let Some(init) = declarator.init.as_deref_mut() else {
            return;
        };
        if consume_component_initializer(init, self.target) {
            self.boundary_helper_needed = true;
            self.changed = true;
        }
    }

    fn visit_mut_var_decl(&mut self, var_decl: &mut VarDecl) {
        for declarator in &mut var_decl.decls {
            declarator.visit_mut_with(self);

            if var_decl.kind != VarDeclKind::Const {
                continue;
            }

            let Some(init) = declarator.init.as_deref() else {
                continue;
            };

            let Some(value) = crate::class_value::collapse::evaluate_constant_truthiness(
                init,
                &self.class_value_scopes,
            ) else {
                continue;
            };

            let Pat::Ident(binding) = &declarator.name else {
                continue;
            };

            self.class_value_scopes
                .insert(binding.id.sym.to_string(), value);
        }
    }

    // A fragment carries no instance and no class, but it does carry children,
    // and the fade running through it still has to reach the ones it cannot see.
    fn visit_mut_jsx_fragment(&mut self, fragment: &mut JSXFragment) {
        fragment.visit_mut_children_with(self);
        if self.opacity_alpha < 1.0 {
            let alpha = self.opacity_alpha;
            self.provide_unreachable_opacity_children(&mut fragment.children, alpha);
        }
    }

    fn visit_mut_jsx_element(&mut self, element: &mut JSXElement) {
        self.isolate_element(element);
        let is_component = is_component_element(&element.opening.name);
        let is_host = is_supported_host_element(&element.opening.name);
        let element_tag =
            (is_host && !is_component).then(|| element_tag_name(&element.opening.name));

        let inherited_alpha = self.opacity_alpha;
        // A component renders its children wherever it likes, and the provider
        // wrapped around it reaches them there. Fading them here as well would
        // apply the same alpha twice.
        self.opacity_alpha = if is_component {
            1.0
        } else {
            self.subtree_opacity_alpha(element, element_tag.as_deref())
        };
        let inherited_pin = self.rem_pinned;
        // `SurfaceGui` is a tag this pass never lowers, but it is one it can
        // still see, and seeing it is what opens the pin over everything below.
        let pins_here = !is_component
            && !inherited_pin
            && self
                .config
                .theme
                .rem
                .pins_under(&element_display_name(&element.opening.name));
        self.rem_pinned = inherited_pin || pins_here;
        if is_host && !is_component {
            self.check_divided_children(element);
        }
        element.visit_mut_children_with(self);
        if self.opacity_alpha < 1.0 {
            let alpha = self.opacity_alpha;
            self.provide_unreachable_opacity_children(&mut element.children, alpha);
        }
        if pins_here {
            self.pin_unreachable_children(element);
        }
        self.opacity_alpha = inherited_alpha;
        self.rem_pinned = inherited_pin;

        if !is_host && !is_component {
            if let Some(diagnostic) = unsupported_host_class_name_diagnostic(
                &element.opening.name,
                &element.opening.attrs,
            ) {
                self.diagnostics.push(diagnostic);
            }
            return;
        }

        let Some(mut lowered) = lower_class_name(
            &element.opening.attrs,
            &self.config,
            element_tag.as_deref(),
            &self.class_value_scopes,
            self.target,
            &mut self.diagnostics,
        ) else {
            // An element with no `className` still sits inside the fade, and it
            // is the common case: a plain `<textlabel Text="…" />`.
            if inherited_alpha < 1.0 && element_tag.is_some() {
                self.apply_inherited_opacity_attrs(
                    element,
                    element_tag.as_deref(),
                    inherited_alpha,
                );
            }
            if is_component {
                self.provide_component_opacity(element, inherited_alpha);
            }
            return;
        };

        if !is_component {
            self.check_divide_layout(element, &lowered.style_ir);
        }

        if is_component
            && (lowered.style_ir.transition.is_some() || lowered.style_ir.animation.is_some())
        {
            self.diagnostics.push(motion_on_component_diagnostic());
            lowered.style_ir.transition = None;
            lowered.style_ir.animation = None;
        }

        if !is_component && !lowered.style_ir.base.helpers.is_empty() {
            let texts: Vec<&str> = lowered
                .tokens
                .iter()
                .map(|token| token.text.as_str())
                .collect();
            let mut helper_diagnostics =
                crate::transform::conflicts::drop_helpers_written_as_children(
                    &mut lowered.style_ir,
                    &element.children,
                    &texts,
                    &self.config,
                    element_tag.as_deref(),
                );
            attach_token_ranges(&mut helper_diagnostics, &lowered.tokens);
            self.diagnostics.extend(helper_diagnostics);
        }

        // A component decides its own rendering, so there is no Roblox default
        // to neutralize and no attribute list that speaks for the instance.
        let mut neutralized = Vec::new();
        if self.config.preflight && !is_component {
            let own_alpha = self.own_opacity_alpha(&element.opening.attrs, element_tag.as_deref());
            neutralized = crate::transform::runtime::apply_preflight(
                &mut lowered.style_ir,
                &declared_prop_names(&lowered.preserved_attrs),
                element_tag.as_deref(),
                own_alpha,
            );
        }

        // A component element has no channel of its own to fade, so its own
        // `opacity-*` joins what it inherited and travels on as one alpha.
        let component_alpha = inherited_alpha * lowered.style_ir.opacity_alpha.unwrap_or(1.0);

        // A class value that only exists at render time resolves tokens this
        // pass never sees, so the runtime host fades whatever it resolves —
        // variant rules included. Everything statically known is faded here.
        let inherited_opacity_at_runtime =
            component_alpha < 1.0 && lowered.style_ir.runtime_class_value;
        if inherited_alpha < 1.0 && !is_component {
            let declared = declared_prop_names(&lowered.preserved_attrs);
            compose_inherited_opacity(
                &mut lowered.style_ir,
                element_tag.as_deref(),
                inherited_alpha,
                &declared,
                !inherited_opacity_at_runtime,
            );
        }

        // A consumer-managed RichText would be double-escaped by the decoration
        // wrapper, so the decoration backs off with a warning.
        if lowered
            .style_ir
            .text
            .as_ref()
            .is_some_and(|text| text.decoration.is_some())
            && has_attr(&lowered.preserved_attrs, "RichText")
        {
            self.diagnostics.push(decoration_on_richtext_diagnostic());
            if let Some(text) = lowered.style_ir.text.as_mut() {
                text.decoration = None;
                if text.transform.is_none() {
                    lowered.style_ir.text = None;
                }
            }
        }

        // A literal `Text` on a static element is transformed at compile time;
        // anything else defers to the runtime host's Text pipeline.
        if !is_component
            && !lowered.needs_runtime_host
            && let Some(spec) = lowered.style_ir.text.clone()
            && apply_static_text_spec(&mut lowered.preserved_attrs, &spec)
        {
            if spec.decoration.is_some() {
                lowered.style_ir.set_prop("RichText", "true".to_owned());
            }
            lowered.style_ir.text = None;
        }

        let mut needs_runtime_host = lowered.needs_runtime_host || lowered.style_ir.text.is_some();
        if !needs_runtime_host
            && !lowered.style_ir.markers.is_empty()
            && !self
                .target
                .static_markers(&lowered.style_ir.markers, &mut lowered.preserved_attrs)
        {
            needs_runtime_host = true;
        }
        lowered.needs_runtime_host = needs_runtime_host;

        // The runtime host provides for its own subtree, alpha and all. A
        // component element the static path lowered has no such moment, so the
        // provider is wrapped around it here.
        let component_provider_alpha = if is_component && !needs_runtime_host {
            component_alpha
        } else {
            1.0
        };

        // The runtime host renders this tag itself, so a component has to be
        // forwarded as a reference rather than as a host element name.
        let runtime_tag = if is_component {
            match element_expression_source(&element.opening.name) {
                Some(source) => source,
                None => {
                    self.provide_component_opacity(element, component_alpha);
                    return;
                }
            }
        } else {
            format!("\"{}\"", element_tag_name(&element.opening.name))
        };

        // A hosted component's own alpha goes in as a rule a variant `opacity-*`
        // replaces, so only what it inherited is handed over beside it.
        let runtime_alpha = if is_component && lowered.needs_runtime_host {
            if let Some(own) = lowered.style_ir.opacity_alpha.take() {
                lowered
                    .style_ir
                    .always_on_effects()
                    .props
                    .push(opacity_alpha_entry(own));
            }
            inherited_alpha
        } else if inherited_opacity_at_runtime {
            component_alpha
        } else {
            1.0
        };

        self.changed = true;
        if lowered.needs_runtime_host {
            crate::transform::branch::hoist_helpers_shared_with_rules(&mut lowered.style_ir);
        }
        crate::transform::runtime::normalize_directional_corner_radii(&mut lowered.style_ir);
        self.ir.push(lowered.style_ir.clone());

        let tests = std::mem::take(&mut lowered.tests);
        let runtime_margin = lowered.runtime_margin;
        let declared = declared_prop_names(&lowered.preserved_attrs);
        let mut attrs = lowered.preserved_attrs;
        if let Some(runtime_class_name) = lowered.runtime_class_name {
            attrs.push(JSXAttrOrSpread::JSXAttr(runtime_class_name));
        }

        // A helper is a host instance of its own that the runtime host never
        // reads back, so its offsets take the binding on either path.
        let scales_rem = !self.config.theme.rem.is_static() && !self.rem_pinned;
        let create_child = if lowered.needs_runtime_host {
            create_helper_child_cast_any
        } else {
            create_helper_child
        };
        let mut helper_children = Vec::new();
        for helper in lowered.style_ir.base.helpers {
            let helper = if scales_rem {
                self.rem.helper(helper)
            } else {
                helper
            };
            let tag = crate::semantic::utility::helper_element_tag(helper.tag);
            let name = match self.target.helper_element_name(tag) {
                Some(name) => {
                    self.helper_namespace_needed = true;
                    name
                }
                None => helper_tag_name(tag),
            };
            let mut child = create_child(helper, name);
            inherit_child_span(&mut child, lowered.class_name_span);
            helper_children.push(child);
        }

        if lowered.needs_runtime_host {
            self.runtime_host_needed = true;
            // A spread can carry a `className` this pass never reads, so it
            // counts as a class value the host may have to resolve.
            self.resolves_class_values |= has_attr(&attrs, "className")
                || attrs
                    .iter()
                    .any(|attr| matches!(attr, JSXAttrOrSpread::SpreadElement(_)));
            // The host re-renders on a rem change anyway, so its own props stay
            // values and it is told which of them to scale.
            let rem_props = if scales_rem {
                crate::transform::rem::scaled_prop_names(&lowered.style_ir.base.props)
            } else {
                Vec::new()
            };
            place_lowered_props(
                &mut attrs,
                lowered.style_ir.base.props,
                &neutralized,
                lowered.class_name_index,
                create_prop_attr_cast_any,
            );
            // What the host resolves at render time cannot be checked against
            // the element's own props here, so it is told which ones to keep.
            if lowered.style_ir.runtime_class_value {
                let own = own_prop_names(&declared);
                if !own.is_empty() {
                    attrs.push(create_prop_attr(PropEntry {
                        name: "__velaOwn".into(),
                        value: serde_json::to_string(&own)
                            .expect("own prop names must serialize to JSON"),
                    }));
                }
            }
            if !rem_props.is_empty() {
                attrs.push(create_prop_attr(PropEntry {
                    name: "__velaRem".into(),
                    value: serde_json::to_string(&rem_props)
                        .expect("rem prop names must serialize to JSON"),
                }));
            }
            // What this element resolves from a class value is scaled where it
            // is resolved, which is inside the host, so a pin this pass can see
            // has to travel with it rather than being applied to the emit.
            if self.rem_pinned && !self.config.theme.rem.is_static() {
                attrs.push(create_prop_attr(PropEntry {
                    name: "__velaRemPinned".into(),
                    value: "true".to_owned(),
                }));
            }
            if !lowered.style_ir.runtime_rules.is_empty() {
                attrs.push(create_prop_attr(PropEntry {
                    name: "__velaRules".into(),
                    value: serde_json::to_string(&lowered.style_ir.runtime_rules)
                        .expect("runtime rules must serialize to JSON"),
                }));
            }
            if !tests.is_empty() {
                attrs.push(self.target.tests_attr(tests));
            }
            if !lowered.style_ir.markers.is_empty() {
                attrs.push(create_prop_attr(PropEntry {
                    name: "__velaMarkers".into(),
                    value: serde_json::to_string(&lowered.style_ir.markers)
                        .expect("markers must serialize to JSON"),
                }));
            }
            if let Some(transition) = &lowered.style_ir.transition {
                attrs.push(create_prop_attr(PropEntry {
                    name: "__velaTransition".into(),
                    value: serde_json::to_string(transition)
                        .expect("transition must serialize to JSON"),
                }));
            }
            if let Some(animation) = &lowered.style_ir.animation {
                attrs.push(create_prop_attr(PropEntry {
                    name: "__velaAnimation".into(),
                    value: format!("\"{animation}\""),
                }));
            }
            if let Some(text) = &lowered.style_ir.text {
                attrs.push(create_prop_attr(PropEntry {
                    name: "__velaText".into(),
                    value: serde_json::to_string(text).expect("text spec must serialize to JSON"),
                }));
            }
            if let Some(divide) = &lowered.style_ir.divide {
                attrs.push(create_prop_attr(PropEntry {
                    name: "__velaDivide".into(),
                    value: serde_json::to_string(divide)
                        .expect("divide spec must serialize to JSON"),
                }));
            }
            if let Some(margin) = &lowered.style_ir.margin {
                attrs.push(create_prop_attr(PropEntry {
                    name: "__velaMargin".into(),
                    value: serde_json::to_string(margin)
                        .expect("margin spec must serialize to JSON"),
                }));
            } else if runtime_margin && self.target.needs_margin_box_hint() {
                attrs.push(create_prop_attr(PropEntry {
                    name: "__velaMarginBox".into(),
                    value: "true".to_owned(),
                }));
            }
            if runtime_alpha < 1.0 {
                attrs.push(create_prop_attr(PropEntry {
                    name: "__velaOpacity".into(),
                    value: runtime_alpha.to_string(),
                }));
            }
            attrs.push(create_prop_attr(PropEntry {
                name: "__velaTag".into(),
                value: runtime_tag,
            }));
            element.opening.name = JSXElementName::Ident(Ident::new_no_ctxt(
                self.target.host_element_name().into(),
                DUMMY_SP,
            ));
            if let Some(closing) = element.closing.as_mut() {
                closing.name = element.opening.name.clone();
            }
        } else {
            let rem = &mut self.rem;
            place_lowered_props(
                &mut attrs,
                lowered.style_ir.base.props,
                &neutralized,
                lowered.class_name_index,
                |prop| {
                    if !scales_rem {
                        return create_prop_attr(prop);
                    }

                    create_prop_attr(rem.prop(prop))
                },
            );
        }

        element.opening.attrs = attrs;

        if !helper_children.is_empty() {
            if element.opening.self_closing {
                element.opening.self_closing = false;
                element.closing = Some(JSXClosingElement {
                    span: DUMMY_SP,
                    name: element.opening.name.clone(),
                });
                element.children = helper_children;
            } else {
                let existing_children = std::mem::take(&mut element.children);
                element.children = helper_children
                    .into_iter()
                    .chain(existing_children)
                    .collect();
            }
        }
        inherit_span(
            &mut element.opening.name,
            &mut element.opening.attrs,
            lowered.class_name_span,
        );

        self.provide_component_opacity(element, component_provider_alpha);
    }
}

/// A `className` read before anything is lowered: the tokens that always
/// apply, and the ones a branch or the runtime decides.
struct ClassReading {
    fixed: Vec<String>,
    conditional: Vec<String>,
}

impl VelaTransformer {
    fn read_class_value(&self, attrs: &[JSXAttrOrSpread]) -> Option<ClassReading> {
        let value = attrs.iter().find_map(|attr| match attr {
            JSXAttrOrSpread::JSXAttr(JSXAttr {
                name: JSXAttrName::Ident(ident),
                value,
                ..
            }) if ident.sym == "className" => value.as_ref(),
            _ => None,
        })?;

        let (fixed, conditional): (Vec<String>, Vec<String>) = match value {
            JSXAttrValue::Str(literal) => (
                literal
                    .value
                    .to_string_lossy()
                    .split_whitespace()
                    .map(str::to_owned)
                    .collect(),
                Vec::new(),
            ),
            JSXAttrValue::JSXExprContainer(container) => {
                let JSXExpr::Expr(expr) = &container.expr else {
                    return None;
                };
                let expr: &Expr = self
                    .target
                    .class_value_is_deferred()
                    .then(|| crate::swc::builders::deferred_body(expr))
                    .flatten()
                    .unwrap_or(expr);
                let collapse = collapse_class_value_expr(expr, &self.class_value_scopes);
                // A literal left inside the runtime's share is only read once it renders.
                let mut leftover = LiteralTokens::default();
                if let Some(dynamic) = &collapse.dynamic_expr {
                    dynamic.visit_with(&mut leftover);
                }
                (
                    collapse
                        .static_tokens()
                        .into_iter()
                        .map(str::to_owned)
                        .collect(),
                    collapse
                        .branches()
                        .flat_map(|branch| branch.tokens.iter().cloned())
                        .chain(leftover.tokens)
                        .collect(),
                )
            }
            _ => return None,
        };

        let expand = |tokens: Vec<String>| -> Vec<String> {
            tokens
                .iter()
                .flat_map(|token| expand_class_token(token, &self.config))
                .filter_map(|expanded| match expanded {
                    ExpandedToken::Class { token, .. } => Some(token),
                    ExpandedToken::Props { .. } => None,
                })
                .collect()
        };

        Some(ClassReading {
            fixed: expand(fixed),
            conditional: expand(conditional),
        })
    }

    /// `isolate` asks for one composited layer, which Roblox only has as a
    /// CanvasGroup. An instance keeps the class it was built as, so only a
    /// static, unconditional token can swap the tag, and it does so before
    /// anything below reads it.
    fn isolate_element(&mut self, element: &mut JSXElement) {
        let Some(reading) = self.read_class_value(&element.opening.attrs) else {
            return;
        };
        if reading.conditional.iter().any(|token| token == "isolate") {
            self.diagnostics
                .push(isolate_not_static_diagnostic("isolate"));
        }
        if !reading.fixed.iter().any(|token| token == "isolate") {
            return;
        }

        if is_component_element(&element.opening.name) {
            self.diagnostics
                .push(isolate_needs_frame_diagnostic(&element_display_name(
                    &element.opening.name,
                )));
            return;
        }
        if !is_supported_host_element(&element.opening.name) {
            return;
        }

        match element_tag_name(&element.opening.name).as_str() {
            "frame" => {
                let JSXElementName::Ident(ident) = &element.opening.name else {
                    return;
                };
                let name =
                    JSXElementName::Ident(Ident::new_no_ctxt("canvasgroup".into(), ident.span));
                if let Some(closing) = element.closing.as_mut() {
                    let span = match &closing.name {
                        JSXElementName::Ident(ident) => ident.span,
                        _ => DUMMY_SP,
                    };
                    closing.name =
                        JSXElementName::Ident(Ident::new_no_ctxt("canvasgroup".into(), span));
                }
                element.opening.name = name;
                self.changed = true;
            }
            "canvasgroup" => {}
            tag => self.diagnostics.push(isolate_needs_frame_diagnostic(tag)),
        }
    }

    /// A divided list ranks its children by the `LayoutOrder` it can read. Where
    /// that is read off the element, an `order-*` only a render decides is not
    /// there yet.
    fn check_divided_children(&mut self, element: &JSXElement) {
        if self.target.reads_built_layout_order() {
            return;
        }
        let Some(reading) = self.read_class_value(&element.opening.attrs) else {
            return;
        };
        if !reading.fixed.iter().any(|token| names_divide(token)) {
            return;
        }

        for child in &element.children {
            let JSXElementChild::JSXElement(child) = child else {
                continue;
            };
            let Some(reading) = self.read_class_value(&child.opening.attrs) else {
                continue;
            };
            let late = reading
                .fixed
                .iter()
                .filter(|token| token.contains(':'))
                .chain(reading.conditional.iter())
                .find(|token| names_order(token));
            if let Some(token) = late {
                self.diagnostics
                    .push(divide_unreadable_order_diagnostic(token));
            }
        }
    }

    /// Separators are list items, so they need a UIListLayout to place them and
    /// turn into cells under a UIGridLayout.
    fn check_divide_layout(&mut self, element: &JSXElement, style: &StyleIr) {
        let Some(divide) = &style.divide else {
            return;
        };

        let helper_tags = style.base.helpers.iter().map(|helper| helper.tag).chain(
            style
                .runtime_rules
                .iter()
                .flat_map(|rule| rule.effects.helpers.iter().map(|helper| helper.tag)),
        );
        let child_tags: Vec<String> = element
            .children
            .iter()
            .filter_map(|child| match child {
                JSXElementChild::JSXElement(child) => {
                    Some(element_display_name(&child.opening.name))
                }
                _ => None,
            })
            .collect();
        let tags: Vec<&str> = helper_tags
            .chain(child_tags.iter().map(String::as_str))
            .collect();

        let token = format!("divide-{}", divide.axis);
        if tags.contains(&"uigridlayout") {
            self.diagnostics.push(divide_with_grid_diagnostic(&token));
        } else if !tags.contains(&"uilistlayout") && !style.runtime_class_value {
            self.diagnostics
                .push(divide_without_list_layout_diagnostic(&token));
        }
    }

    /// The alpha this element hands to everything nested inside it.
    fn subtree_opacity_alpha(&self, element: &JSXElement, element_tag: Option<&str>) -> f64 {
        // A CanvasGroup composites its subtree in one pass, so its own
        // `GroupTransparency` already carries the fade for everything below and
        // nothing under it repeats the multiplication.
        if element_tag == Some("canvasgroup") {
            return 1.0;
        }

        self.opacity_alpha
            * self
                .own_opacity_alpha(&element.opening.attrs, element_tag)
                .unwrap_or(1.0)
    }

    fn own_opacity_alpha(
        &self,
        attrs: &[JSXAttrOrSpread],
        element_tag: Option<&str>,
    ) -> Option<f64> {
        let value = attrs.iter().find_map(|attr| match attr {
            JSXAttrOrSpread::JSXAttr(JSXAttr {
                name: JSXAttrName::Ident(ident),
                value,
                ..
            }) if ident.sym == "className" => value.as_ref(),
            _ => None,
        })?;

        match value {
            JSXAttrValue::Str(literal) => {
                let class_name = literal.value.to_string_lossy();
                static_opacity_alpha(class_name.split_whitespace(), &self.config)
            }
            JSXAttrValue::JSXExprContainer(container) => {
                let JSXExpr::Expr(expr) = &container.expr else {
                    return None;
                };
                let collapse = collapse_class_value_expr(expr, &self.class_value_scopes);
                // A class value settled at render time can name an `opacity-*`
                // this pass never sees, and a branch naming one takes the whole
                // list with it. Either way the runtime host resolves all of it
                // and hands its subtree one alpha, rather than the two of them
                // each fading part of it. A branch that names none is no reason
                // to ignore the tokens written around it.
                if collapse.dynamic_expr.is_some()
                    || branch_opacity_needs_runtime(&collapse, element_tag, &self.config)
                {
                    return None;
                }
                static_opacity_alpha(collapse.static_tokens(), &self.config)
            }
            _ => None,
        }
    }

    /// Children written as JSX are walked and faded with everything else.
    /// Children that arrive as a value are elements this pass never sees, so the
    /// alpha is handed to them at render time instead. A component child needs
    /// the same, and wraps itself on the way past.
    fn provide_unreachable_opacity_children(
        &mut self,
        children: &mut [JSXElementChild],
        alpha: f64,
    ) {
        for child in children.iter_mut() {
            let unreachable = match child {
                JSXElementChild::JSXExprContainer(container) => match &container.expr {
                    JSXExpr::Expr(expr) => !contains_jsx(expr),
                    JSXExpr::JSXEmptyExpr(_) => false,
                },
                JSXElementChild::JSXSpreadChild(_) => true,
                _ => false,
            };
            if !unreachable {
                continue;
            }

            let wrapped = std::mem::replace(
                child,
                JSXElementChild::JSXExprContainer(JSXExprContainer {
                    span: DUMMY_SP,
                    expr: JSXExpr::JSXEmptyExpr(JSXEmptyExpr { span: DUMMY_SP }),
                }),
            );
            let wrapped = self.target.provider_child(wrapped);
            *child =
                JSXElementChild::JSXElement(self.target.opacity_provider(alpha, vec![wrapped]));
            self.changed = true;
            self.opacity_helper_needed = true;
        }
    }

    /// Opens the pin at runtime as well as in the emit. Everything this pass
    /// lowered below the container already carries literal offsets; a component
    /// rendered there was compiled against the viewport in a file of its own,
    /// and this is what tells it where it ended up.
    fn pin_unreachable_children(&mut self, element: &mut JSXElement) {
        if self.config.theme.rem.is_static() || !children_leave_the_static_path(&element.children) {
            return;
        }

        let children = std::mem::take(&mut element.children)
            .into_iter()
            .map(|child| self.target.provider_child(child))
            .collect();

        if element.opening.self_closing {
            element.opening.self_closing = false;
            element.closing = Some(JSXClosingElement {
                span: DUMMY_SP,
                name: element.opening.name.clone(),
            });
        }

        element.children = vec![JSXElementChild::JSXElement(
            self.target.pin_provider(children),
        )];
        self.changed = true;
        self.boundary_helper_needed = true;
    }

    /// Wraps a component element in the runtime's provider. Its instances are
    /// created out of sight of this pass, so the alpha reaches them as context
    /// and lowers against the tags it finds there.
    fn provide_component_opacity(&mut self, element: &mut JSXElement, alpha: f64) {
        if alpha >= 1.0 {
            return;
        }

        let mut provider = self.target.opacity_provider(alpha, Vec::new());
        std::mem::swap(element, provider.as_mut());
        element.children.push(
            self.target
                .provider_child(JSXElementChild::JSXElement(provider)),
        );
        self.changed = true;
        self.opacity_helper_needed = true;
    }

    /// Fades an element that carries no `className` of its own — a plain
    /// `<textlabel Text="…" />` is still inside the subtree.
    fn apply_inherited_opacity_attrs(
        &mut self,
        element: &mut JSXElement,
        element_tag: Option<&str>,
        alpha: f64,
    ) {
        let mut style = StyleIr::default();
        compose_inherited_opacity(
            &mut style,
            element_tag,
            alpha,
            &declared_prop_names(&element.opening.attrs),
            true,
        );

        if style.base.props.is_empty() {
            return;
        }

        self.changed = true;
        element
            .opening
            .attrs
            .extend(style.base.props.into_iter().map(create_prop_attr));
    }
}

#[derive(Default)]
struct LiteralTokens {
    tokens: Vec<String>,
}

impl Visit for LiteralTokens {
    fn visit_str(&mut self, value: &Str) {
        self.tokens.extend(
            value
                .value
                .to_string_lossy()
                .split_whitespace()
                .map(str::to_owned),
        );
    }

    fn visit_tpl_element(&mut self, element: &TplElement) {
        self.tokens
            .extend(element.raw.split_whitespace().map(str::to_owned));
    }
}

#[derive(Default)]
struct JsxPresence {
    found: bool,
}

impl Visit for JsxPresence {
    fn visit_jsx_element(&mut self, _: &JSXElement) {
        self.found = true;
    }

    fn visit_jsx_fragment(&mut self, _: &JSXFragment) {
        self.found = true;
    }
}

/// Whether anything under a container reaches an element this pass did not
/// lower itself: a component, or children handed over as a value. A subtree
/// written out as plain host JSX was already pinned in the emit, and wrapping
/// it would cost a provider that has nothing left to tell.
fn children_leave_the_static_path(children: &[JSXElementChild]) -> bool {
    children.iter().any(|child| match child {
        JSXElementChild::JSXElement(element) => {
            is_component_element(&element.opening.name)
                || children_leave_the_static_path(&element.children)
        }
        JSXElementChild::JSXFragment(fragment) => {
            children_leave_the_static_path(&fragment.children)
        }
        JSXElementChild::JSXExprContainer(container) => {
            !matches!(container.expr, JSXExpr::JSXEmptyExpr(_))
        }
        JSXElementChild::JSXSpreadChild(_) => true,
        JSXElementChild::JSXText(_) => false,
    })
}

fn names_divide(token: &str) -> bool {
    let parsed = parse_utility(token);
    matches!(parsed.kind, UtilityKind::DivideX | UtilityKind::DivideY)
        && parsed.payload.as_deref() != Some("0")
}

fn names_order(token: &str) -> bool {
    token
        .rsplit(':')
        .next()
        .is_some_and(|utility| utility.starts_with("order-"))
}

pub(crate) fn contains_jsx(expr: &Expr) -> bool {
    let mut presence = JsxPresence::default();
    expr.visit_with(&mut presence);
    presence.found
}

/// Only a spread can still collide with what the class lowers to, since a
/// declared prop has already taken the class's copy out. So with one present,
/// preflight's defaults go ahead of everything, where whatever paints the
/// element outranks them, and the class's props take the class's own place, so
/// JSX order decides between them and the spread as it was written.
fn place_lowered_props(
    attrs: &mut Vec<JSXAttrOrSpread>,
    props: Vec<PropEntry>,
    neutralized: &[&'static str],
    class_name_index: usize,
    mut lower: impl FnMut(PropEntry) -> JSXAttrOrSpread,
) {
    if !attrs
        .iter()
        .any(|attr| matches!(attr, JSXAttrOrSpread::SpreadElement(_)))
    {
        attrs.extend(props.into_iter().map(lower));
        return;
    }

    let (defaults, props): (Vec<_>, Vec<_>) = props
        .into_iter()
        .partition(|prop| neutralized.iter().any(|name| prop.name == *name));
    let index = class_name_index.min(attrs.len());
    let props: Vec<_> = props.into_iter().map(&mut lower).collect();
    attrs.splice(index..index, props);
    let defaults: Vec<_> = defaults.into_iter().map(&mut lower).collect();
    attrs.splice(0..0, defaults);
}

/// The element's own props the runtime host has to leave standing: everything
/// it was written with, less what only the host or React reads.
fn own_prop_names(declared: &[String]) -> Vec<&str> {
    declared
        .iter()
        .map(String::as_str)
        .filter(|name| {
            !name.starts_with("__vela")
                && !matches!(
                    *name,
                    "children" | "key" | "ref" | "Event" | "Change" | "Text"
                )
        })
        .collect()
}

fn has_attr(attrs: &[JSXAttrOrSpread], name: &str) -> bool {
    attrs.iter().any(|attr| {
        matches!(
            attr,
            JSXAttrOrSpread::JSXAttr(JSXAttr {
                name: JSXAttrName::Ident(ident),
                ..
            }) if ident.sym == name
        )
    })
}

/// Rewrites a literal `Text` attribute in place; false when the text is not a
/// static string and has to go through the runtime pipeline instead.
fn apply_static_text_spec(attrs: &mut [JSXAttrOrSpread], spec: &TextSpec) -> bool {
    for attr in attrs {
        let JSXAttrOrSpread::JSXAttr(attr) = attr else {
            continue;
        };
        let JSXAttrName::Ident(ident) = &attr.name else {
            continue;
        };
        if ident.sym != "Text" {
            continue;
        }

        let Some(JSXAttrValue::Str(value)) = &attr.value else {
            return false;
        };

        let mut text = value.value.to_string_lossy().into_owned();
        match spec.transform.as_deref() {
            Some("upper") => text = text.to_ascii_uppercase(),
            Some("lower") => text = text.to_ascii_lowercase(),
            Some("capitalize") => text = capitalize_ascii_words(&text),
            _ => {}
        }
        match spec.decoration.as_deref() {
            Some("underline") => text = format!("<u>{}</u>", escape_rich_text(&text)),
            Some("strike") => text = format!("<s>{}</s>", escape_rich_text(&text)),
            _ => {}
        }

        attr.value = Some(JSXAttrValue::Str(Str {
            span: value.span,
            value: text.into(),
            raw: None,
        }));
        return true;
    }

    false
}

fn capitalize_ascii_words(value: &str) -> String {
    let mut result = String::with_capacity(value.len());
    let mut at_word_start = true;
    for ch in value.chars() {
        if ch.is_ascii_alphabetic() {
            result.push(if at_word_start {
                ch.to_ascii_uppercase()
            } else {
                ch
            });
            at_word_start = false;
        } else {
            result.push(ch);
            at_word_start = !ch.is_ascii_alphanumeric();
        }
    }
    result
}

fn escape_rich_text(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}
