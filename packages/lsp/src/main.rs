mod documents;
mod server;
mod state;
mod translate;

use server::RbxtsLanguageServer;
use tokio::io::{stdin, stdout};
use tower_lsp::{LspService, Server};

#[tokio::main]
async fn main() {
    eprintln!("vela-rbxts-lsp: starting stdio LSP server");

    let (service, socket) = LspService::new(RbxtsLanguageServer::new);
    Server::new(stdin(), stdout(), socket).serve(service).await;
}
