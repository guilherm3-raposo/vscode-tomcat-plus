import { existsSync, mkdirSync, PathLike } from "fs";
import os from "os";
import path, { sep } from "path";
import vscode from "vscode";
import { TomcatEntry, TomcatEntryOption, TomcatEntryOptionWebapp } from "./TomcatEntry";
import { TomcatTreeviewDataProvider } from "./TomcatTreeviewDataProvider";
import { MinorVersions } from "./types";
import {
	asyncCall,
	downloadSelectedVersion,
	fetchMinorVersion,
	isProcessRunning,
	removeSelectedVersion,
	run,
	startServer,
	stopServer,
} from "./utils";

export const platform = os.platform();
export let extensionContext: vscode.ExtensionContext;
export let extensionDataFolder: string;
export let serversFolder: PathLike;
export let zipsFolder: PathLike;

const tomcatMajorVersions = ["7", "8", "9", "10"];

const tomcatMinorVersions: MinorVersions = {
	"7": [],
	"8": [],
	"9": [],
	"10": [],
};

const installOptions: vscode.QuickPickOptions = {
	canPickMany: false,
	title: "Tomcat Plus: Select Tomcat version",
	placeHolder: "Select major version",
};

const minorVersionOptions: vscode.QuickPickOptions = {
	canPickMany: false,
	title: "Tomcat Plus: Select Tomcat version",
	placeHolder: "Select minor version",
};

const removeOptions: vscode.QuickPickOptions = {
	canPickMany: false,
	title: "Tomcat Plus: Select version to remove",
	placeHolder: "Select version",
};

const serverPickOptions: vscode.QuickPickOptions = {
	canPickMany: false,
	title: "Tomcat Plus: Select the server you wish to deploy to",
	placeHolder: "Select server",
};

export async function activate(context: vscode.ExtensionContext) {
	if (!context.storageUri?.path) {
		return Promise.reject("No storage folder");
	}

	extensionDataFolder = context.storageUri.path;

	serversFolder = path.join(extensionDataFolder, "servers");
	zipsFolder = path.join(extensionDataFolder, "zips");

	if (!existsSync(serversFolder)) {
		mkdirSync(serversFolder, { recursive: true });
	}

	if (!existsSync(zipsFolder)) {
		mkdirSync(zipsFolder, { recursive: true });
	}

	extensionContext = context;

	const treeViewProvider = new TomcatTreeviewDataProvider();

	vscode.window.registerTreeDataProvider("tomcat-plus", treeViewProvider);

	let terminal: vscode.Terminal;

	let install = vscode.commands.registerCommand("tomcat-plus.install", async () => {
		const version = await vscode.window.showQuickPick(tomcatMajorVersions, installOptions);

		if (typeof version !== "undefined") {
			await fetchMinorVersion(version, tomcatMinorVersions);

			let minorVersion: string | undefined = await vscode.window.showQuickPick(
				tomcatMinorVersions[version],
				minorVersionOptions,
			);

			if (typeof minorVersion !== "undefined") {
				const [res, err] = await asyncCall(
					downloadSelectedVersion(version, minorVersion.replace("Latest: ", "")),
				);
				if (err) {
					return Promise.reject(err);
				}
			}

			treeViewProvider.refresh();
		}
	});

	let remove = vscode.commands.registerCommand("tomcat-plus.remove", async () => {
		const entries: Array<TomcatEntry> = treeViewProvider.getEntries();
		const currentVersions = entries.map((en) => en.name);

		const version = await vscode.window.showQuickPick(currentVersions, removeOptions);

		if (typeof version !== "undefined") {
			removeSelectedVersion(version);

			treeViewProvider.refresh();
		}
	});

	let start = vscode.commands.registerCommand("tomcat-plus.start", () => {
		if (typeof terminal === "undefined") {
			terminal = vscode.window.createTerminal("tomcat-plus");
		}

		terminal.show(true);
	});

	let toggleServer = vscode.commands.registerCommand("tomcat-plus.toggleServer", async (entry: TomcatEntry) => {
		const serverPath = path.join(serversFolder.toString(), entry.name) + sep;

		if (await isProcessRunning(entry.pid)) {
			await stopServer(entry, serverPath);
		} else {
			await startServer(entry, serverPath);
		}

		treeViewProvider.refresh();
	});

	let refreshEntries = vscode.commands.registerCommand("tomcat-plus.refreshEntries", () => {
		treeViewProvider.refresh();
	});

	let deployWar = vscode.commands.registerCommand("tomcat-plus.deployWar", async (entry: TomcatEntryOptionWebapp) => {
		vscode.commands.executeCommand("tomcat-plus.addMavenWebapp", null, null, entry.parent.name);
	});

	let addWebapp = vscode.commands.registerCommand(
		"tomcat-plus.addMavenWebapp",
		async (selectedFile: vscode.Uri, uris: vscode.Uri[], serverName?: string) => {
			let selected;

			if (uris) {
				selected = uris.map((uri) => uri.path);
			} else {
				const files = (await vscode.workspace.findFiles("**/*.war")).map((uri) => uri.path);

				selected = await vscode.window.showQuickPick(files, {
					canPickMany: true,
					title: "Tomcat Plus: Select the projects you wish to deploy",
					placeHolder: "Select projects",
				});
			}

			if (!serverName) {
				serverName = await vscode.window.showQuickPick(treeViewProvider.getServerNames(), serverPickOptions);
			}

			if (!serverName) {
				return vscode.window.showErrorMessage("No server selected");
			}

			selected?.forEach((f, i) => {
				let warName = f.replace(/.+\//, "");

				run(`ln -s ${f} ${path.join(serversFolder.toString(), <string>serverName, "webapps", warName)}`);

				treeViewProvider.addWarToServer(warName, serverName);
			});

			treeViewProvider.refresh();
		},
	);

	/**
	 * @TODO Implement logic to select target server for these commands so user can use quickpick
	 */
	let showCatalinaLog = vscode.commands.registerCommand("tomcat-plus.showCatalinaLog", (entry: TomcatEntryOption) => {
		treeViewProvider.showCatalinaLog(entry);
	});

	let editServerXml = vscode.commands.registerCommand("tomcat-plus.editServerXml", (entry: TomcatEntryOption) => {
		treeViewProvider.editServerXml(entry);
	});

	let editContextXml = vscode.commands.registerCommand("tomcat-plus.editContextXml", (entry: TomcatEntryOption) => {
		treeViewProvider.editContextXml(entry);
	});

	let editSetenv = vscode.commands.registerCommand("tomcat-plus.editSetenv", (entry: TomcatEntryOption) => {
		treeViewProvider.editSetenv(entry);
	});

	let removeDeployedWar = vscode.commands.registerCommand(
		"tomcat-plus.removeDeployedWar",
		(entry: TomcatEntryOptionWebapp) => {
			treeViewProvider.removeDeployedWar(entry);
		},
	);

	context.subscriptions.push(install);
	context.subscriptions.push(remove);
	context.subscriptions.push(toggleServer);
	context.subscriptions.push(refreshEntries);
	context.subscriptions.push();
}

export function deactivate() {}
