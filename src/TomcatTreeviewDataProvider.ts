import { readdirSync } from "fs";
import { readdir, rm } from "fs/promises";
import path, { sep } from "path";
import vscode from "vscode";
import { platform, serversFolder } from "./extension";
import { TomcatEntry, TomcatEntryOption, TomcatEntryOptionBuilder, TomcatEntryOptionWebapp } from "./TomcatEntry";
import { getServerPid, isProcessRunning } from "./utils";

const collapsed = vscode.TreeItemCollapsibleState.Collapsed;
const expanded = vscode.TreeItemCollapsibleState.Expanded;
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
		if (element?.contextValue === "deployedWars") {
			return Promise.resolve(element?.children);
		} else {
			return new Promise(async (res, rej) => {
				if (element?.contextValue === "root") {
					let wars = readdirSync(path.join(serversFolder.toString(), element.name, "webapps"), {
						withFileTypes: true,
					});

					wars = wars.filter((ent) => ent.name.includes("war"));

					const deployedWars = wars.map(
						(war) =>
							new TomcatEntryOptionWebapp(
								war.name,
								war.name,
								none,
								<TomcatEntryOption>element,
								"removeDeployedWar",
								"tomcat-plus.removeDeployedWar",
							),
					);

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
						new TomcatEntryOptionBuilder("Deployed WARs", collapsed, element)
							.contextValue("deployedWars")
							.children(deployedWars)
							.build(),
					];

					element.children = menuItems;
					res(menuItems);
				} else {
					res(this.entries);
				}
			});
		}
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

	async removeDeployedWar(entry: TomcatEntryOptionWebapp) {
		const url = path.join(serversFolder.toString(), entry.parent.name, "webapps", entry.name);
		await rm(url);
		return this.refresh();
	}

	addWarToServer(warName: string, serverName: any) {
		for (const entry of this.entries) {
			if (entry.name !== serverName) {
				continue;
			}

			if (entry.children?.find((child: TomcatEntry) => child.name === warName)) {
				vscode.window.showInformationMessage(`Tomcat Plus: War ${warName} already added`);
				break;
			}

			entry.children?.push(
				new TomcatEntryOptionWebapp(
					warName,
					warName,
					vscode.TreeItemCollapsibleState.Collapsed,
					<TomcatEntryOption>entry,
				),
			);

			entry.collapsibleState = expanded;
		}
	}
}
