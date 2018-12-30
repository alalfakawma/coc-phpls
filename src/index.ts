import { ExtensionContext, LanguageClient, ServerOptions, workspace, services, TransportKind, LanguageClientOptions, FileSystemWatcher } from 'coc.nvim'
import { DocumentSelector } from 'vscode-languageserver-protocol'
import { CancellationToken } from 'vscode-jsonrpc'
import Uri from 'vscode-uri';
import Glob from 'glob'

import { WorkspaceDiscovery } from './workspaceDiscovery';

const sections = ['php']

export async function activate(context: ExtensionContext): Promise<void> {
  let { subscriptions } = context
  let c = workspace.getConfiguration()
  const config = c.get('phpls') as any
  const enable = config.enable
  const file = require.resolve('intelephense-server');

  if (enable === false) return
  if (!file) {
    workspace.showMessage("intelephense-server not found!, please run yarn global add intelephense-server", 'error')
    return
  }

  const selector: DocumentSelector = [{
    language: 'php',
    scheme: 'file'
  }]

  let serverOptions: ServerOptions = {
    module: file,
    args: ['--node-ipc'],
    transport: TransportKind.ipc,
    options: {
      cwd: workspace.root,
      execArgv: config.execArgv || []
    }
  }

  let fsWatcher: FileSystemWatcher = workspace.createFileSystemWatcher('**/*.php', true, false, true)

  let clientOptions: LanguageClientOptions = {
    documentSelector: selector,
    synchronize: {
      configurationSection: sections,
      fileEvents: fsWatcher
    },
    outputChannelName: 'php',
    initializationOptions: {}
  }

  let client = new LanguageClient('php', 'PHP Language Server', serverOptions, clientOptions)

  subscriptions.push(
    services.registLanguageClient(client)
  )

  setTimeout(() => {
    WorkspaceDiscovery.client = client

    fsWatcher.onDidDelete(onDidDelete);
    fsWatcher.onDidCreate(onDidCreate);
    fsWatcher.onDidChange(onDidChange);

    let startedTime: Date

    readAllFile(workspace.rootPath)
      .then(files => files.map(file => Uri.file(file)))
      .then(uriArray => {
        let token: CancellationToken;
        workspace.showMessage('Indexing started.');
        startedTime = new Date()
        return WorkspaceDiscovery.checkCacheThenDiscover(uriArray, true, token);
      })
      .then(() => {
        let usedTime: number = Math.abs(new Date().getTime() - startedTime.getTime())
        workspace.showMessage("Indexed php files, times: " + usedTime + "ms");
      })
  }, 1000)
}

function onDidDelete(uri: Uri) {
  WorkspaceDiscovery.forget(uri);
}

function onDidChange(uri: Uri) {
  WorkspaceDiscovery.delayedDiscover(uri);
}

function onDidCreate(uri: Uri) {
  onDidChange(uri);
}

function readAllFile(root: string) {
  return new Promise<string[]>((resolve, reject) => {
    Glob(root + "/**/*.php", (err, matches) => {
      if (err == null) {
        resolve(matches)
      }
      reject(err)
    })
  });
}
