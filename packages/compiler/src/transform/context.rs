use crate::api::Diagnostic;
use crate::class_value::scope::ClassValueScopeStack;
use crate::ir::model::{PropEntry, StyleIr};
use crate::transform::jsx::lower_class_name;
use crate::transform::module::{create_runtime_host_module_items, element_tag_name, is_supported_host_element};
use crate::swc::builders::{create_helper_child, create_prop_attr};
use swc_core::{
    common::DUMMY_SP,
    ecma::ast::{
        BlockStmt, Ident, JSXAttrOrSpread, JSXClosingElement, JSXElement, JSXElementName, Module,
        Pat, VarDecl, VarDeclKind,
    },
    ecma::visit::{VisitMut, VisitMutWith},
};

pub(crate) struct TailwindTransformer {
    pub(crate) changed: bool,
    pub(crate) config: crate::config::model::TailwindConfig,
    pub(crate) diagnostics: Vec<Diagnostic>,
    pub(crate) ir: Vec<StyleIr>,
    pub(crate) runtime_import_needed: bool,
    pub(crate) class_value_scopes: ClassValueScopeStack,
}

impl VisitMut for TailwindTransformer {
    fn visit_mut_module(&mut self, module: &mut Module) {
        self.class_value_scopes.push();
        module.visit_mut_children_with(self);
        self.class_value_scopes.pop();

        if self.runtime_import_needed {
            let mut runtime_items = create_runtime_host_module_items(&self.config);
            runtime_items.append(&mut module.body);
            module.body = runtime_items;
        }
    }

    fn visit_mut_block_stmt(&mut self, block: &mut BlockStmt) {
        self.class_value_scopes.push();
        block.visit_mut_children_with(self);
        self.class_value_scopes.pop();
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

            let Some(value) = crate::class_value::collapse::evaluate_constant_truthiness(init, &self.class_value_scopes) else {
                continue;
            };

            let Pat::Ident(binding) = &declarator.name else {
                continue;
            };

            self.class_value_scopes
                .insert(binding.id.sym.to_string(), value);
        }
    }

    fn visit_mut_jsx_element(&mut self, element: &mut JSXElement) {
        element.visit_mut_children_with(self);

        if !is_supported_host_element(&element.opening.name) {
            return;
        }

        let Some(lowered) = lower_class_name(
            &element.opening.attrs,
            &self.config,
            &self.class_value_scopes,
            &mut self.diagnostics,
        ) else {
            return;
        };

        self.changed = true;
        self.ir.push(lowered.style_ir.clone());

        let mut attrs = lowered.preserved_attrs;
        if let Some(runtime_class_name) = lowered.runtime_class_name {
            attrs.push(JSXAttrOrSpread::JSXAttr(runtime_class_name));
        }

        let helper_children = lowered
            .style_ir
            .base
            .helpers
            .into_iter()
            .map(create_helper_child)
            .collect::<Vec<_>>();

        if lowered.needs_runtime_host {
            self.runtime_import_needed = true;
            attrs.extend(
                lowered
                    .style_ir
                    .base
                    .props
                    .into_iter()
                    .map(create_prop_attr),
            );
            if !lowered.style_ir.runtime_rules.is_empty() {
                attrs.push(create_prop_attr(PropEntry {
                    name: "__rbxtsTailwindRules",
                    value: serde_json::to_string(&lowered.style_ir.runtime_rules)
                        .expect("runtime rules must serialize to JSON"),
                }));
            }
            attrs.push(create_prop_attr(PropEntry {
                name: "__rbxtsTailwindTag",
                value: format!("\"{}\"", element_tag_name(&element.opening.name)),
            }));
            element.opening.name = JSXElementName::Ident(Ident::new_no_ctxt(
                "RbxtsTailwindRuntimeHost".into(),
                DUMMY_SP,
            ));
        } else {
            attrs.extend(
                lowered
                    .style_ir
                    .base
                    .props
                    .into_iter()
                    .map(create_prop_attr),
            );
        }

        element.opening.attrs = attrs;

        if element.opening.self_closing && helper_children.is_empty() {
            return;
        }

        if element.opening.self_closing {
            element.opening.self_closing = false;
            element.closing = Some(JSXClosingElement {
                span: DUMMY_SP,
                name: element.opening.name.clone(),
            });
            element.children = helper_children;
            return;
        }

        if helper_children.is_empty() {
            return;
        }

        let existing_children = std::mem::take(&mut element.children);
        element.children = helper_children
            .into_iter()
            .chain(existing_children)
            .collect();
    }
}
