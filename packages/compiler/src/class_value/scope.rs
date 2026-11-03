use std::collections::BTreeMap;

use swc_core::ecma::ast::Ident;

/// What a `const` is known to hold: whether it is truthy, and its text when it
/// is a string literal, which is what a class value reads it for.
struct ConstValue {
    truthy: bool,
    text: Option<String>,
}

#[derive(Default)]
pub(crate) struct ClassValueScopeStack {
    scopes: Vec<BTreeMap<String, ConstValue>>,
}

impl ClassValueScopeStack {
    pub(crate) fn push(&mut self) {
        self.scopes.push(BTreeMap::new());
    }

    pub(crate) fn pop(&mut self) {
        self.scopes.pop();
    }

    pub(crate) fn insert(&mut self, name: String, truthy: bool, text: Option<String>) {
        if let Some(scope) = self.scopes.last_mut() {
            scope.insert(name, ConstValue { truthy, text });
        }
    }

    pub(crate) fn resolve(&self, ident: &Ident) -> Option<bool> {
        self.lookup(ident).map(|value| value.truthy)
    }

    pub(crate) fn resolve_text(&self, ident: &Ident) -> Option<&str> {
        self.lookup(ident).and_then(|value| value.text.as_deref())
    }

    fn lookup(&self, ident: &Ident) -> Option<&ConstValue> {
        let name = ident.sym.to_string();

        self.scopes.iter().rev().find_map(|scope| scope.get(&name))
    }
}
