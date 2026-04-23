pub(crate) mod collapse;
pub(crate) mod scope;

pub(crate) fn tokenize_class_name(input: &str) -> Vec<&str> {
    input
        .split_whitespace()
        .filter(|token| !token.is_empty())
        .collect()
}
