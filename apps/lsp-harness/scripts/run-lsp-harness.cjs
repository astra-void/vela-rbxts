const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const REQUEST_TIMEOUT_MS = 15000;
const EXIT_TIMEOUT_MS = 5000;
const COMPLETION_KIND_COLOR = 16;

const root = path.join(__dirname, "..");
const binary = path.join(
	root,
	"..",
	"..",
	"packages",
	"lsp",
	"target",
	"release",
	"vela-rbxts-lsp",
);

if (!fs.existsSync(binary)) {
	console.error(
		`missing LSP binary at ${binary}; run \`pnpm --filter @vela-rbxts/lsp build\` first`,
	);
	process.exit(1);
}

const child = spawn(binary, [], { stdio: ["pipe", "pipe", "inherit"] });

let nextId = 1;
const pending = new Map();
const notifications = [];
const notificationWaiters = [];
let buffer = Buffer.alloc(0);

child.stdout.on("data", (chunk) => {
	buffer = Buffer.concat([buffer, chunk]);
	for (;;) {
		const headerEnd = buffer.indexOf("\r\n\r\n");
		if (headerEnd < 0) {
			return;
		}
		const header = buffer.subarray(0, headerEnd).toString("utf8");
		const match = /Content-Length:\s*(\d+)/i.exec(header);
		if (!match) {
			buffer = buffer.subarray(headerEnd + 4);
			continue;
		}
		const length = Number(match[1]);
		const start = headerEnd + 4;
		if (buffer.length < start + length) {
			return;
		}
		const message = JSON.parse(buffer.subarray(start, start + length).toString("utf8"));
		buffer = buffer.subarray(start + length);
		dispatch(message);
	}
});

function dispatch(message) {
	if (message.id !== undefined && pending.has(message.id)) {
		const { resolve, reject } = pending.get(message.id);
		pending.delete(message.id);
		if (message.error) {
			reject(new Error(`${message.error.code}: ${message.error.message}`));
		} else {
			resolve(message.result);
		}
		return;
	}

	if (message.method) {
		notifications.push(message);
		for (const waiter of [...notificationWaiters]) {
			waiter();
		}
	}
}

function send(message) {
	const body = Buffer.from(JSON.stringify(message), "utf8");
	child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
	child.stdin.write(body);
}

function request(method, params) {
	const id = nextId++;
	send(
		params === undefined
			? { jsonrpc: "2.0", id, method }
			: { jsonrpc: "2.0", id, method, params },
	);
	return new Promise((resolve, reject) => {
		pending.set(id, { resolve, reject });
		setTimeout(() => {
			if (pending.delete(id)) {
				reject(new Error(`timed out waiting for ${method} response`));
			}
		}, REQUEST_TIMEOUT_MS).unref();
	});
}

function notify(method, params) {
	send(
		params === undefined
			? { jsonrpc: "2.0", method }
			: { jsonrpc: "2.0", method, params },
	);
}

function waitForDiagnostics(uri) {
	return new Promise((resolve, reject) => {
		const check = () => {
			const found = notifications
				.filter(
					(entry) =>
						entry.method === "textDocument/publishDiagnostics" &&
						entry.params.uri === uri,
				)
				.pop();
			if (found) {
				resolve(found.params.diagnostics);
				return true;
			}
			return false;
		};

		if (check()) {
			return;
		}
		const timer = setTimeout(() => {
			reject(new Error(`timed out waiting for diagnostics of ${uri}`));
		}, REQUEST_TIMEOUT_MS);
		timer.unref();
		notificationWaiters.push(() => {
			if (check()) {
				clearTimeout(timer);
			}
		});
	});
}

// The publish that follows a given point in the stream, rather than whatever was
// last published, which is what a config push has to be judged by.
function waitForNextDiagnostics(uri, mark) {
	return new Promise((resolve, reject) => {
		const check = () => {
			const found = notifications
				.slice(mark)
				.filter(
					(entry) =>
						entry.method === "textDocument/publishDiagnostics" &&
						entry.params.uri === uri,
				)
				.pop();
			if (found) {
				resolve(found.params.diagnostics);
				return true;
			}
			return false;
		};

		if (check()) {
			return;
		}
		const timer = setTimeout(() => {
			reject(new Error(`timed out waiting for diagnostics of ${uri}`));
		}, REQUEST_TIMEOUT_MS);
		timer.unref();
		notificationWaiters.push(() => {
			if (check()) {
				clearTimeout(timer);
			}
		});
	});
}

function openFixture(name) {
	const filePath = path.join(root, "fixtures", name);
	const text = fs.readFileSync(filePath, "utf8");
	const uri = pathToFileURL(filePath).href;
	notify("textDocument/didOpen", {
		textDocument: { uri, languageId: "typescriptreact", version: 1, text },
	});
	return { uri, text };
}

// Fixtures are ASCII, so byte offsets equal UTF-16 columns.
function positionAt(text, index) {
	const before = text.slice(0, index);
	const line = (before.match(/\n/g) ?? []).length;
	return { line, character: index - before.lastIndexOf("\n") - 1 };
}

function offsetAt(text, position) {
	const lines = text.split("\n");
	let offset = 0;
	for (let line = 0; line < position.line; line++) {
		offset += lines[line].length + 1;
	}
	return offset + position.character;
}

function sliceRange(text, range) {
	return text.slice(offsetAt(text, range.start), offsetAt(text, range.end));
}

const failures = [];

function check(condition, message) {
	if (!condition) {
		failures.push(message);
	}
}

function diagnosticFor(diagnostics, token) {
	return diagnostics.find((entry) => entry.data?.token === token);
}

async function main() {
	const init = await request("initialize", {
		processId: process.pid,
		rootUri: pathToFileURL(root).href,
		capabilities: {},
	});
	check(
		init.serverInfo?.name === "vela-rbxts-lsp",
		`unexpected server name: ${init.serverInfo?.name}`,
	);
	check(Boolean(init.capabilities.completionProvider), "missing completion capability");
	check(Boolean(init.capabilities.colorProvider), "missing document color capability");
	check(Boolean(init.capabilities.hoverProvider), "missing hover capability");
	check(
		Boolean(init.capabilities.inlayHintProvider),
		"missing inlay hint capability",
	);
	notify("initialized", {});

	const diagnosticsFixture = openFixture("Diagnostics.tsx");
	const diagnostics = await waitForDiagnostics(diagnosticsFixture.uri);

	const expectedCodes = [
		["tracking-wide", "no-roblox-equivalent"],
		["md:rounded-mdd", "unknown-theme-key"],
		["bg-[oops]", "unsupported-arbitrary-value"],
		["placeholder-white/50", "unsupported-opacity-modifier"],
		["blorb-2", "unsupported-utility-family"],
		["checked:px-2", "unknown-variant"],
		["duration-fast", "unsupported-transition-value"],
		["animate-ping", "unsupported-animation-value"],
		["scroll-smooth", "unsupported-scroll-value"],
		["font-handwriting", "unknown-theme-key"],
	];
	for (const [token, code] of expectedCodes) {
		const diagnostic = diagnosticFor(diagnostics, token);
		check(diagnostic, `missing diagnostic for token ${token}`);
		if (!diagnostic) {
			continue;
		}
		check(
			diagnostic.code === code,
			`token ${token} reported ${diagnostic.code}, expected ${code}`,
		);
		check(diagnostic.severity === 2, `token ${token} should be a warning`);
		const anchored = sliceRange(diagnosticsFixture.text, diagnostic.range);
		check(
			anchored === token,
			`token ${token} range anchors to ${JSON.stringify(anchored)}`,
		);
	}
	check(
		!diagnosticFor(diagnostics, "rounded"),
		'bare "rounded" should resolve to the default radius without diagnostics',
	);
	check(
		!diagnosticFor(diagnostics, "bg-slate-700"),
		'"bg-slate-700" should resolve without diagnostics',
	);
	check(
		!diagnosticFor(diagnostics, "from-blue-600/50"),
		'"from-blue-600/50" should lower its opacity modifier without diagnostics',
	);
	check(
		!diagnosticFor(diagnostics, "px-4"),
		'object-key "px-4" should resolve without diagnostics',
	);
	for (const token of [
		"right-4",
		"order-2",
		"self-center",
		"grid-cols-3",
		"-translate-x-1/2",
		"basis-1/2",
		"mx-auto",
		"pointer-events-none",
		"space-y-2",
		"ring-2",
		"m-4",
		"-ml-2",
		"divide-y-2",
		"divide-slate-500",
		"hover:bg-blue-600",
		"active:bg-rose-500",
		"focus:border-blue-600",
		"dark:bg-slate-900",
		"w-[120px]",
		"p-[7px]",
		"rounded-[10px]",
		"bg-[#ff0000]",
		"bg-blue-600/50",
		"transition",
		"transition-colors",
		"duration-300",
		"ease-out",
		"animate-spin",
		"uppercase",
		"underline",
		"scroll-y",
		"scrollbar-w-2",
		"scrollbar-slate-500",
		"canvas-auto",
		"font-mono",
		"font-bold",
	]) {
		check(
			!diagnosticFor(diagnostics, token),
			`"${token}" should resolve without diagnostics`,
		);
	}

	const colors = await request("textDocument/documentColor", {
		textDocument: { uri: diagnosticsFixture.uri },
	});
	check(
		Array.isArray(colors) && colors.length > 0,
		"documentColor returned no colors for bg-slate-700",
	);

	const slate700 = (colors ?? []).find(
		(entry) => sliceRange(diagnosticsFixture.text, entry.range) === "bg-slate-700",
	);
	check(slate700, "missing document color entry for bg-slate-700");
	if (slate700) {
		const presentations = await request("textDocument/colorPresentation", {
			textDocument: { uri: diagnosticsFixture.uri },
			range: slate700.range,
			color: { red: 98 / 255, green: 116 / 255, blue: 142 / 255, alpha: 1 },
		});
		const labels = (presentations ?? []).map((entry) => entry.label);
		// `bg-slate` (the DEFAULT shade) shares slate-500's RGB, so either may win
		// the exact-match tie.
		check(
			labels[0] === "bg-slate-500" || labels[0] === "bg-slate",
			`picking the slate-500 color should lead with a matching theme token, got ${labels[0]}`,
		);
		check(
			labels.includes("bg-slate-500"),
			"bg-slate-500 should be offered for its exact RGB",
		);
		check(
			labels.includes("bg-slate-700"),
			"the current token should stay available among presentations",
		);
		const presentationEdit = (presentations ?? []).find(
			(entry) => entry.label === "bg-slate-500",
		)?.textEdit;
		check(
			presentationEdit &&
				sliceRange(diagnosticsFixture.text, presentationEdit.range) ===
					"bg-slate-700",
			"presentation edit should replace the whole token",
		);
	}

	const hoverIndex = diagnosticsFixture.text.indexOf('"px-4"') + 3;
	const hover = await request("textDocument/hover", {
		textDocument: { uri: diagnosticsFixture.uri },
		position: positionAt(diagnosticsFixture.text, hoverIndex),
	});
	check(
		Boolean(hover?.contents?.value?.trim()),
		"hover over an object-key class returned no content",
	);

	const variantHoverIndex = diagnosticsFixture.text.indexOf("checked:px-2") + 2;
	const variantHover = await request("textDocument/hover", {
		textDocument: { uri: diagnosticsFixture.uri },
		position: positionAt(diagnosticsFixture.text, variantHoverIndex),
	});
	check(
		(variantHover?.contents?.value ?? "").includes("Unknown variant `checked`"),
		"hover over an unknown variant should call the variant out instead of claiming it runs",
	);

	const codeActionsFor = (diagnostic) =>
		request("textDocument/codeAction", {
			textDocument: { uri: diagnosticsFixture.uri },
			range: diagnostic.range,
			context: { diagnostics: [diagnostic] },
		});
	const actionEditTexts = (actions) =>
		(actions ?? []).map(
			(action) => action.edit?.changes?.[diagnosticsFixture.uri]?.[0]?.newText,
		);

	const variantDiagnostic = diagnosticFor(diagnostics, "hover:px-4");
	if (variantDiagnostic) {
		const texts = actionEditTexts(await codeActionsFor(variantDiagnostic));
		check(
			texts.includes("px-4"),
			"unknown-variant quickfix should offer dropping the variant to keep `px-4`",
		);
		check(texts.includes(""), "quickfix should still offer removing the token");
	}

	const typoDiagnostic = diagnosticFor(diagnostics, "md:rounded-mdd");
	if (typoDiagnostic) {
		const texts = actionEditTexts(await codeActionsFor(typoDiagnostic));
		check(
			texts.includes("md:rounded-md"),
			"theme-key quickfix should keep the typed `md:` variant",
		);
	}

	const sortActions = await request("textDocument/codeAction", {
		textDocument: { uri: diagnosticsFixture.uri },
		range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
		context: { diagnostics: [], only: ["source.sortVelaClasses"] },
	});
	const sortAction = (sortActions ?? []).find(
		(action) => action.kind === "source.sortVelaClasses",
	);
	check(sortAction, "source action should offer sorting the class names");
	const sortEdits = sortAction?.edit?.changes?.[diagnosticsFixture.uri] ?? [];
	check(
		sortEdits.length > 0,
		"sort action should carry at least one class name edit",
	);
	check(
		sortEdits.every(
			(edit) => !sliceRange(diagnosticsFixture.text, edit.range).includes('"'),
		),
		"sort edits should stay inside the class name string",
	);

	const completionsFixture = openFixture("Completions.tsx");
	await waitForDiagnostics(completionsFixture.uri);
	const typed = "md:bg-sl";
	const typedIndex = completionsFixture.text.indexOf(typed);
	const completion = await request("textDocument/completion", {
		textDocument: { uri: completionsFixture.uri },
		position: positionAt(completionsFixture.text, typedIndex + typed.length),
		context: { triggerKind: 1 },
	});
	check(
		completion?.isIncomplete === true,
		"completion should return an incomplete list so the server-side matcher stays in charge",
	);
	const items = completion?.items ?? [];
	check(items.length > 0, "completion returned no items");
	check(
		items.every((item) => item.label !== "md:"),
		"an already-typed variant should not be offered again",
	);

	const colorItem = items.find((item) => item.label === "bg-slate-500");
	check(colorItem, "missing bg-slate-500 completion for prefix md:bg-sl");
	if (colorItem) {
		check(
			colorItem.kind === COMPLETION_KIND_COLOR,
			`bg-slate-500 completion kind is ${colorItem.kind}, expected color`,
		);
		check(
			/^#[0-9a-fA-F]{6}$/.test(colorItem.detail ?? ""),
			`bg-slate-500 detail should be a hex swatch, got ${JSON.stringify(colorItem.detail)}`,
		);
		check(
			typeof colorItem.documentation === "string" &&
				/^#[0-9a-fA-F]{6}$/.test(colorItem.documentation),
			`color completion documentation must be the bare hex string so the client draws a swatch, got ${JSON.stringify(colorItem.documentation)}`,
		);
		check(
			typeof colorItem.sortText === "string" && colorItem.sortText.length > 0,
			"bg-slate-500 completion is missing sortText",
		);
		const editRange = colorItem.textEdit?.range;
		check(editRange, "bg-slate-500 completion is missing a text edit");
		if (editRange) {
			check(
				sliceRange(completionsFixture.text, editRange) === "bg-sl",
				"completion edit should replace only the utility after the typed variant",
			);
		}
	}

	const variantsFixture = openFixture("Variants.tsx");
	await waitForDiagnostics(variantsFixture.uri);
	const variantIndex = variantsFixture.text.indexOf("hover:bg-slate-700");
	const variantCompletion = await request("textDocument/completion", {
		textDocument: { uri: variantsFixture.uri },
		position: positionAt(variantsFixture.text, variantIndex + 3),
		context: { triggerKind: 1 },
	});
	const variantItems = variantCompletion?.items ?? [];
	check(
		variantItems.length > 0 && variantItems.every((item) => item.label.endsWith(":")),
		"a cursor inside a variant should complete variants, not utilities",
	);
	const variantEdit = variantItems[0]?.textEdit?.range;
	check(
		variantEdit && sliceRange(variantsFixture.text, variantEdit) === "hover:",
		"completing a variant should replace the variant alone so the utility behind it survives",
	);

	const brokenFixture = openFixture("Broken.tsx");
	const brokenDiagnostics = await waitForDiagnostics(brokenFixture.uri);
	const brokenUnknownVariant = diagnosticFor(brokenDiagnostics, "checked:px-4");
	check(
		brokenUnknownVariant?.code === "unknown-variant",
		"a file that fails to parse should still surface diagnostics via the lexical fallback",
	);

	const bomFixture = openFixture("Bom.tsx");
	const bomDiagnostics = await waitForDiagnostics(bomFixture.uri);
	const bomDiagnostic = diagnosticFor(bomDiagnostics, "blorb-2");
	check(
		bomDiagnostic?.code === "unsupported-utility-family",
		"a file behind a BOM should report the same diagnostics as one without",
	);
	if (bomDiagnostic) {
		check(
			sliceRange(bomFixture.text, bomDiagnostic.range) === "blorb-2",
			"a BOM should not shift diagnostic ranges",
		);
	}
	const bomColors = await request("textDocument/documentColor", {
		textDocument: { uri: bomFixture.uri },
	});
	check(
		(bomColors ?? []).some(
			(entry) => sliceRange(bomFixture.text, entry.range) === "bg-slate-700",
		),
		"a BOM should not hide document colors",
	);
	const bomHover = await request("textDocument/hover", {
		textDocument: { uri: bomFixture.uri },
		position: positionAt(bomFixture.text, bomFixture.text.indexOf("px-4") + 1),
	});
	check(
		bomHover && sliceRange(bomFixture.text, bomHover.range) === "px-4",
		"a BOM should not shift hover ranges",
	);

	const bracketsFixture = openFixture("Brackets.tsx");
	const bracketDiagnostics = await waitForDiagnostics(bracketsFixture.uri);
	check(
		!bracketDiagnostics.some((entry) =>
			["w-[", "]"].includes(entry.data?.token),
		),
		"an arbitrary value a template interpolation splices into should not be reported",
	);
	const bracketActions = await request("textDocument/codeAction", {
		textDocument: { uri: bracketsFixture.uri },
		range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
		context: { diagnostics: [], only: ["source.sortVelaClasses"] },
	});
	const bracketEdits =
		(bracketActions ?? []).find((action) => action.kind === "source.sortVelaClasses")
			?.edit?.changes?.[bracketsFixture.uri] ?? [];
	check(
		bracketEdits.some(
			(edit) => edit.newText === "w-[calc(100% - 4px)] px-4 hover:px-2",
		),
		"sorting should move an arbitrary value written with spaces without breaking it",
	);
	check(
		bracketEdits.some((edit) => edit.newText === "w-[120px] px-4 hover:px-2"),
		"sorting should still reorder a value whose arbitrary values are balanced",
	);

	// The editor pushes configs as a notification, so the server has to accept it
	// as one.
	const configFixture = openFixture("Config.tsx");
	const beforeConfig = await waitForDiagnostics(configFixture.uri);
	check(
		diagnosticFor(beforeConfig, "bg-brand")?.code === "unknown-theme-key",
		"bg-brand should be unknown until a config defines it",
	);
	const configMark = notifications.length;
	notify("vela-rbxts/setConfigs", {
		configs: [
			{
				dir: path.join(root, "fixtures"),
				json: JSON.stringify({
					theme: { colors: { brand: "Color3.fromRGB(255, 136, 0)" } },
				}),
			},
		],
	});
	const afterConfig = await waitForNextDiagnostics(configFixture.uri, configMark);
	check(
		!diagnosticFor(afterConfig, "bg-brand"),
		"a setConfigs notification should reach the server and resolve the theme key",
	);
	const configColors = await request("textDocument/documentColor", {
		textDocument: { uri: configFixture.uri },
	});
	check(
		(configColors ?? []).some(
			(entry) => sliceRange(configFixture.text, entry.range) === "bg-brand",
		),
		"a config pushed by notification should feed document colors too",
	);

	// v0.13. The variants a project defines have to reach the editor the same
	// way the built-in ones do: completed, hovered, diagnosed and sorted.
	const stateFixture = openFixture("StateVariants.tsx");
	await waitForDiagnostics(stateFixture.uri);
	const stateMark = notifications.length;
	notify("vela-rbxts/setConfigs", {
		configs: [
			{
				dir: path.join(root, "fixtures"),
				json: JSON.stringify({
					theme: {
						extend: {
							colors: { brand: "Color3.fromRGB(255, 136, 0)" },
							screens: { tablet: 900 },
						},
					},
					plugins: {
						variants: {
							open: { attribute: "State", equals: "open" },
							selected: { attribute: "Selected", equals: true },
						},
					},
				}),
			},
		],
	});
	const stateDiagnostics = await waitForNextDiagnostics(
		stateFixture.uri,
		stateMark,
	);

	for (const token of [
		"open:bg-blue-600",
		"attr-[Selected=true]:ring-2",
		"md:px-6",
		"max-md:px-3",
		"md:max-lg:px-4",
		"tablet:px-8",
	]) {
		check(
			!diagnosticFor(stateDiagnostics, token),
			`"${token}" should resolve against the pushed config without diagnostics`,
		);
	}

	for (const [token, code] of [
		["max-mdd:px-2", "unknown-breakpoint"],
		["attr-[State]:px-2", "malformed-attribute-variant"],
		["md:max-sm:px-2", "invalid-breakpoint-range"],
	]) {
		const diagnostic = diagnosticFor(stateDiagnostics, token);
		check(diagnostic, `missing ${code} diagnostic for ${token}`);
		if (!diagnostic) {
			continue;
		}
		check(
			diagnostic.code === code,
			`token ${token} reported ${diagnostic.code}, expected ${code}`,
		);
		const anchored = sliceRange(stateFixture.text, diagnostic.range);
		check(
			anchored === token,
			`token ${token} range anchors to ${JSON.stringify(anchored)}`,
		);
	}

	// An unknown breakpoint is repairable: the quickfix offers the breakpoints
	// the config actually defines.
	const breakpointDiagnostic = diagnosticFor(stateDiagnostics, "max-mdd:px-2");
	if (breakpointDiagnostic) {
		const actions = await request("textDocument/codeAction", {
			textDocument: { uri: stateFixture.uri },
			range: breakpointDiagnostic.range,
			context: {
				diagnostics: [breakpointDiagnostic],
				only: ["quickfix"],
			},
		});
		const texts = (actions ?? []).map(
			(action) => action.edit?.changes?.[stateFixture.uri]?.[0]?.newText,
		);
		check(
			texts.includes("max-md:px-2"),
			`unknown-breakpoint quickfix should repair the breakpoint, got ${JSON.stringify(texts)}`,
		);
		check(
			texts.includes("px-2"),
			"unknown-breakpoint quickfix should offer dropping the variant",
		);
	}

	const openIndex = stateFixture.text.indexOf("open:bg-blue-600");
	const stateHover = await request("textDocument/hover", {
		textDocument: { uri: stateFixture.uri },
		position: positionAt(stateFixture.text, openIndex + 2),
	});
	check(
		(stateHover?.contents?.value ?? "").includes("`State` attribute is `open`"),
		"hover over a custom variant should name the attribute it reads",
	);

	const rangeHover = await request("textDocument/hover", {
		textDocument: { uri: stateFixture.uri },
		position: positionAt(stateFixture.text, stateFixture.text.indexOf("max-md:px-3") + 2),
	});
	check(
		(rangeHover?.contents?.value ?? "").includes("narrower than 768px"),
		"hover over a max-width variant should describe its bound",
	);

	const stateCompletion = await request("textDocument/completion", {
		textDocument: { uri: stateFixture.uri },
		// At the very start of the variant, so nothing is typed to filter by and
		// the whole vocabulary is offered.
		position: positionAt(
			stateFixture.text,
			stateFixture.text.indexOf("open:bg-blue-600"),
		),
		context: { triggerKind: 1 },
	});
	const variantLabels = (stateCompletion?.items ?? []).map(
		(item) => item.label,
	);
	check(
		variantLabels.includes("selected:"),
		`a custom variant should be offered, got ${JSON.stringify(variantLabels.slice(0, 8))}`,
	);
	check(
		variantLabels.includes("tablet:") && variantLabels.includes("max-tablet:"),
		"a configured breakpoint should be offered with its max-width twin",
	);
	check(
		variantLabels.some((label) => label.startsWith("attr-[")),
		"the inline attribute variant should be offered",
	);

    // Off unless the client asked for them.
	const hintsOff = await request("textDocument/inlayHint", {
		textDocument: { uri: stateFixture.uri },
		range: {
			start: { line: 0, character: 0 },
			end: { line: 20, character: 0 },
		},
	});
	check(
		hintsOff === null || (hintsOff ?? []).length === 0,
		"inlay hints should be off until the client turns them on",
	);

	notify("workspace/didChangeConfiguration", {
		settings: { velaRbxts: { inlayHints: { enabled: true } } },
	});
	const hintsOn = await request("textDocument/inlayHint", {
		textDocument: { uri: stateFixture.uri },
		range: {
			start: { line: 0, character: 0 },
			end: { line: 20, character: 0 },
		},
	});
	check(
		(hintsOn ?? []).length > 0,
		"inlay hints should be served once the client turns them on",
	);
	check(
		(hintsOn ?? []).some((hint) =>
			String(hint.label ?? "").includes("UIPadding"),
		),
		`an inlay hint should name what the utility lowers to, got ${JSON.stringify((hintsOn ?? []).map((hint) => hint.label))}`,
	);

	await request("shutdown");
	notify("exit");
}

// The stdin the server reads stays open, so what ends the process has to be the
// notification rather than the pipe closing behind it.
function waitForServerExit() {
	return new Promise((resolve) => {
		const timer = setTimeout(() => {
			failures.push("the server should exit on the exit notification");
			child.kill();
			resolve();
		}, EXIT_TIMEOUT_MS);
		timer.unref();
		child.on("exit", (code) => {
			clearTimeout(timer);
			if (code !== 0) {
				failures.push(`the server should exit cleanly; got code ${code}`);
			}
			resolve();
		});
	});
}

main()
	.catch((error) => {
		failures.push(error.message);
	})
	.finally(async () => {
		await waitForServerExit();
		if (failures.length > 0) {
			console.error(failures.join("\n"));
			process.exit(1);
		}
		console.log("lsp-harness: all checks passed");
		process.exit(0);
	});
