use swc_core::{
    common::{SourceMap, sync::Lrc},
    ecma::{codegen::{Config as CodegenConfig, Emitter, text_writer::JsWriter}, ast::Module},
};

pub(crate) fn emit_module(cm: &Lrc<SourceMap>, module: &Module) -> Result<String, String> {
    let mut output = Vec::new();
    {
        let mut emitter = Emitter {
            cfg: CodegenConfig::default(),
            cm: cm.clone(),
            comments: None,
            wr: JsWriter::new(cm.clone(), "\n", &mut output, None),
        };

        emitter
            .emit_module(module)
            .map_err(|error| format!("Failed to emit JS/TSX: {error:?}"))?;
    }

    String::from_utf8(output)
        .map_err(|error| format!("Generated output was not valid UTF-8: {error}"))
}
