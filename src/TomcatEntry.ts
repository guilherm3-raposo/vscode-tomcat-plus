import * as vscode from "vscode";

export class TomcatEntry extends vscode.TreeItem {
	constructor(
		public label: string,
		public name: string,
		public collapsibleState: vscode.TreeItemCollapsibleState,
		public contextValue?: string,
		public pid?: number | null,
		public command?: any,
		public children?: Array<TomcatEntry>,
	) {
		super(label, collapsibleState);
		this.name = name;
		this.contextValue = contextValue;
		this.pid = pid;
		this.command = command;
		this.children = children || [];
	}
}

export class TomcatEntryOption extends TomcatEntry {
	constructor(
		public label: string,
		public name: string,
		public collapsibleState: vscode.TreeItemCollapsibleState,
		public parent: TomcatEntry,
		public contextValue?: string,
		public pid?: number | null,
		public command?: any,
		public children?: Array<TomcatEntryOptionWebapp>,
	) {
		super(label, name, collapsibleState, contextValue, pid, command, children);
		this.parent = parent;
	}
}

export class TomcatEntryOptionWebapp extends TomcatEntry {
	constructor(
		public label: string,
		public name: string,
		public collapsibleState: vscode.TreeItemCollapsibleState,
		public parent: TomcatEntryOption,
		public contextValue?: string,
		public command?: any,
	) {
		super(label, name, collapsibleState, contextValue, command);
		this.parent = parent;
	}
}

export class TomcatEntryBuilder {
	private _label: string = "";
	private _name: string = "";
	private _collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None;
	private _contextValue?: string;
	private _pid?: number | null;
	private _command?: any;

	constructor() {}

	build() {
		return new TomcatEntry(
			this._label,
			this._name,
			this._collapsibleState,
			this._contextValue,
			this._pid,
			this._command,
		);
	}

	label(label: string) {
		this._label = label;
		return this;
	}

	name(name: string) {
		this._name = name;
		return this;
	}

	collapsibleState(collapsibleState: vscode.TreeItemCollapsibleState) {
		this._collapsibleState = collapsibleState;
		return this;
	}

	contextValue(contextValue: string) {
		this._contextValue = contextValue;
		return this;
	}

	pid(pid: number | null) {
		this._pid = pid;
		return this;
	}

	command(command: string) {
		this._command = command;
		return this;
	}
}

export class TomcatEntryOptionBuilder {
	private _label: string;
	private _collapsibleState: vscode.TreeItemCollapsibleState;
	private _parent: TomcatEntry;
	private _name: string = "";
	private _contextValue?: string;
	private _pid?: number | null;
	private _command?: any;
	private _children?: Array<TomcatEntryOptionWebapp>;

	constructor(label: string, collapsibleState: vscode.TreeItemCollapsibleState, parent: TomcatEntry) {
		this._label = label;
		this._collapsibleState = collapsibleState;
		this._parent = parent;
	}

	build() {
		return new TomcatEntryOption(
			this._label,
			this._name,
			this._collapsibleState,
			this._parent,
			this._contextValue,
			this._pid,
			this._command,
			this._children,
		);
	}

	name(name: string) {
		this._name = name;
		return this;
	}

	contextValue(contextValue?: string) {
		this._contextValue = contextValue;
		return this;
	}

	pid(pid?: number | null) {
		this._pid = pid;
		return this;
	}

	command(command?: string) {
		this._command = command;
		return this;
	}

	children(children: Array<TomcatEntryOptionWebapp>) {
		this._children = children;
		return this;
	}
}
