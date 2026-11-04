mod documents;
mod quickfix;
mod rules;
mod server;
mod state;
mod translate;

use server::RbxtsLanguageServer;
use tokio::io::{stdin, stdout};
use tower_lsp_server::{LspService, Server};

#[tokio::main]
async fn main() {
    eprintln!("vela-rbxts-lsp: starting stdio LSP server");

    let (service, socket) = LspService::build(RbxtsLanguageServer::new)
        .custom_method("vela-rbxts/setConfigs", RbxtsLanguageServer::set_configs)
        .finish();
    Server::new(stdin(), stdout(), socket).serve(service).await;
}
