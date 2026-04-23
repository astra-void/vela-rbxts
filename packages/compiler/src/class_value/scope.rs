use std::collections::BTreeMap;

use swc_core::ecma::ast::Ident;

#[derive(Default)]
pub(crate) struct ClassValueScopeStack {
    scopes: Vec<BTreeMap<String, bool>>,
}

impl ClassValueScopeStack {
    pub(crate) fn push(&mut self) {
        self.scopes.push(BTreeMap::new());
    }

    pub(crate) fn pop(&mut self) {
        self.scopes.pop();
    }

    pub(crate) fn insert(&mut self, name: String, value: bool) {
        if let Some(scope) = self.scopes.last_mut() {
            scope.insert(name, value);
        }
    }

    pub(crate) fn resolve(&self, ident: &Ident) -> Option<bool> {
        let name = ident.sym.to_string();

        for scope in self.scopes.iter().rev() {
            if let Some(value) = scope.get(&name) {
                return Some(*value);
            }
        }

        None
    }
}
