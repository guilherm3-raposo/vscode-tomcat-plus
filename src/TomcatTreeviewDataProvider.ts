import { readdir } from "fs/promises";
import path, { sep } from "path";
import vscode from "vscode";
import { platform, serversFolder } from "./extension";
import { TomcatEntry, TomcatEntryOption, TomcatEntryOptionBuilder } from "./TomcatEntry";
import { getServerPid, isProcessRunning } from "./utils";

const collapsed = vscode.TreeItemCollapsibleState.Collapsed;
const none = vscode.TreeItemCollapsibleState.None;

export class TomcatTreeviewDataProvider implements vscode.TreeDataProvider<TomcatEntry> {
	private entries: Array<TomcatEntry> = [];

	constructor() {
		this.refresh();
	}

	getEntries() {
		return this.entries;
	}

	getServerNames() {
		return this.entries.map((v) => v.name);
	}

	private _onDidChangeTreeData: vscode.EventEmitter<void | TomcatEntry | null | undefined> = new vscode.EventEmitter<
		void | TomcatEntry | null | undefined
	>();

	onDidChangeTreeData?: vscode.Event<void | TomcatEntry | null | undefined> | undefined =
		this._onDidChangeTreeData.event;

	async refresh(): Promise<void> {
		this.entries = [];

		const folders = await readdir(serversFolder);

		for (let i = 0; i < folders.length; i++) {
			const folder = folders[i];

			let pid = getServerPid(path.join(serversFolder.toString(), folder) + sep);
			const running = await isProcessRunning(pid);
			const name = `${running ? "🟢" : "🔴"} ${folder}`;
			try {
				this.entries.push(new TomcatEntry(name, folder, collapsed, "root", pid, "tomcat-plus.toggleServer"));
			} catch (error) {
				debugger;
			}
		}

		console.log(this.entries);
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: TomcatEntry): vscode.TreeItem | Thenable<vscode.TreeItem> {
		return element;
	}

	getChildren(element?: TomcatEntry): vscode.ProviderResult<any> {
		return new Promise((res, rej) => {
			if (element?.contextValue === "root") {
				const menuItems = [
					new TomcatEntryOptionBuilder("Show catalina log", none, element)
						.contextValue("catalinaLog")
						.command("tomcat-plus.showCatalinaLog")
						.build(),
					new TomcatEntryOptionBuilder("Edit server.xml", none, element)
						.contextValue("editConfig")
						.command("tomcat-plus.editConfig")
						.build(),
					new TomcatEntryOptionBuilder("Edit context.xml", none, element)
						.contextValue("editContext")
						.command("tomcat-plus.editContext")
						.build(),
					new TomcatEntryOptionBuilder("Edit setenv", none, element)
						.contextValue("editSetenv")
						.command("tomcat-plus.editSetenv")
						.build(),
				];
				element.children = menuItems;
				res(menuItems);
			} else {
				res(this.entries);
			}
		});
	}

	async showCatalinaLog(entry: TomcatEntryOption) {
		const catalinaLog = path.join(serversFolder.toString(), entry.parent.name, "logs", "catalina.log");
		let uri = vscode.Uri.file(catalinaLog);
		let success = await vscode.commands.executeCommand("vscode.open", uri);
	}

	async editServerXml(entry: TomcatEntryOption) {
		const serverXml = path.join(serversFolder.toString(), entry.parent.name, "conf", "server.xml");
		let uri = vscode.Uri.file(serverXml);
		let success = await vscode.commands.executeCommand("vscode.open", uri);
	}

	async editContextXml(entry: TomcatEntryOption) {
		const contextXml = path.join(serversFolder.toString(), entry.parent.name, "conf", "context.xml");
		let uri = vscode.Uri.file(contextXml);
		let success = await vscode.commands.executeCommand("vscode.open", uri);
	}

	async editSetenv(entry: TomcatEntryOption) {
		const url = path.join(
			serversFolder.toString(),
			entry.parent.name,
			"bin",
			`setenv.${platform === "win32" ? "bat" : "sh"}`,
		);
		let uri = vscode.Uri.file(url);
		let success = await vscode.commands.executeCommand("vscode.open", uri);
	}
}
