--!strict
-- Unit checks for runtime-core helpers no class value reaches, run against the
-- same compiled output the differential suites load.

local process = require("@lune/process")
local roblox = require("@lune/roblox") :: any
local task = require("@lune/task")

local shim = require("./rbxts-shim")

local outDir = process.args[1]
assert(outDir, "usage: lune run units.luau <runtime-core/out>")

-- Stand-ins for what __VelaScope reaches for: signals that can be fired, a
-- CollectionService whose tag signals fire, tags, and a parent chain.
local function fakeSignal()
	local handlers = {}
	local signal = {}
	function signal:Connect(handler)
		table.insert(handlers, handler)
		return {
			Disconnect = function()
				local index = table.find(handlers, handler)
				if index then
					table.remove(handlers, index)
				end
			end,
		}
	end
	function signal:Fire(...)
		for _, handler in table.clone(handlers) do
			handler(...)
		end
	end
	function signal:Count(): number
		return #handlers
	end
	return signal
end

local tagSignals: { [string]: any } = {}
local function tagSignal(kind: string, tag: string): any
	local key = `{kind}:{tag}`
	local existing = tagSignals[key]
	if existing == nil then
		existing = fakeSignal()
		tagSignals[key] = existing
	end
	return existing
end

shim.services.CollectionService = {
	GetInstanceAddedSignal = function(_, tag: string)
		return tagSignal("added", tag)
	end,
	GetInstanceRemovedSignal = function(_, tag: string)
		return tagSignal("removed", tag)
	end,
}

local core = shim.load(outDir)
local failures = 0

local function same(left: { number }, right: { number }): boolean
	if #left ~= #right then
		return false
	end
	for index, value in left do
		if right[index] ~= value then
			return false
		end
	end
	return true
end

local function check(name: string, ok: boolean, detail: string?)
	if not ok then
		failures += 1
		print(`  {name}{if detail then `: {detail}` else ""}`)
	end
end

local function plan(name: string, orders: { number }, child: { number }, separator: { number })
	local result = core.__VelaDivide.planDivideOrder(orders)
	check(
		`planDivideOrder {name}`,
		same(result.child, child) and same(result.separator, separator),
		`child {table.concat(result.child, ",")} separator {table.concat(result.separator, ",")}`
	)
end

plan("in source order", { 0, 0, 0 }, { 0, 2, 4 }, { 1, 3 })
plan("by declared order", { 3, 1, 2 }, { 4, 0, 2 }, { 1, 3 })
plan("order-first and order-last", { 0, 9999, -9999 }, { 2, 4, 0 }, { 1, 3 })
plan("ties kept in source order", { 1, 0, 1, 0 }, { 4, 0, 6, 2 }, { 1, 3, 5 })
plan("a single child", { 7 }, { 0 }, {})
plan("no children", {}, {}, {})

local divide = core.__VelaDivide
check("divide-y-0 removes the separators", divide.resolveDivideConfig({ axis = "y", thickness = 0 }, nil, 1) == nil)
check(
	"a dynamic divide-x-0 removes static separators",
	divide.resolveDivideConfig({ axis = "y", thickness = 1 }, { thickness = 0 }, 1) == nil
)
local composed = divide.resolveDivideConfig({ axis = "y", thickness = 1, transparency = 0.5 }, nil, 1, 0.5)
check("a static transparency is not composed twice", composed ~= nil and composed.transparency == 0.5)
local dynamic = divide.resolveDivideConfig({ axis = "y", thickness = 1 }, { transparency = 0.5 }, 1, 0.5)
check(
	"a dynamic transparency meets the static fade",
	dynamic ~= nil and math.abs(dynamic.transparency - 0.75) < 1e-9
)
check("separators fade with the subtree", math.abs(divide.separatorTransparency({ transparency = 0.5 }, 0.5) - 0.75) < 1e-9)

local SIGNALS = {
	"MouseEnter",
	"MouseLeave",
	"InputBegan",
	"InputEnded",
	"SelectionGained",
	"SelectionLost",
	"Focused",
	"FocusLost",
	"AncestryChanged",
	"Destroying",
	"ChildAdded",
	"ChildRemoved",
}

local function fakeInstance(className: string, tags: { string }?): any
	local self: any = { ClassName = className, Parent = nil, tags = tags or {}, children = {} }
	for _, name in SIGNALS do
		self[name] = fakeSignal()
	end
	function self:HasTag(tag: string): boolean
		return table.find(self.tags, tag) ~= nil
	end
	function self:IsA(name: string): boolean
		return name == "GuiObject" or name == self.ClassName
	end
	function self:GetChildren()
		return table.clone(self.children)
	end
	function self:GetDescendants()
		local found = {}
		for _, child in self.children do
			table.insert(found, child)
			for _, descendant in child:GetDescendants() do
				table.insert(found, descendant)
			end
		end
		return found
	end
	function self:IsDescendantOf(other: any): boolean
		local current = self.Parent
		while current ~= nil do
			if current == other then
				return true
			end
			current = current.Parent
		end
		return false
	end
	return self
end

local function fireAncestry(node: any, parent: any)
	node.AncestryChanged:Fire(node, parent)
	for _, child in node.children do
		fireAncestry(child, parent)
	end
end

local function parentTo(child: any, parent: any)
	local previous = child.Parent
	if previous ~= nil then
		table.remove(previous.children, table.find(previous.children, child))
		previous.ChildRemoved:Fire(child)
	end
	child.Parent = parent
	if parent ~= nil then
		table.insert(parent.children, child)
		parent.ChildAdded:Fire(child)
	end
	fireAncestry(child, parent)
end

local function addTag(instance: any, tag: string)
	table.insert(instance.tags, tag)
	tagSignal("added", tag):Fire(instance)
end

-- Fires before the tag goes, the order a reader cannot rely on either way.
local function removeTag(instance: any, tag: string)
	tagSignal("removed", tag):Fire(instance)
	table.remove(instance.tags, table.find(instance.tags, tag))
end

local scope = core.__VelaScope
check("markerTag reads a bare group", scope.markerTag("group") == "VelaGroup")
check("markerTag reads a named peer", scope.markerTag("peer/field") == "VelaPeer/field")
check("markerTag rejects an empty name", scope.markerTag("group/") == nil)
check("markerTag leaves other utilities alone", scope.markerTag("groups") == nil)

do
	local outer = fakeInstance("Frame", { "VelaGroup/outer" })
	local card = fakeInstance("Frame", { "VelaGroup" })
	local label = fakeInstance("TextLabel", { "VelaGroup" })
	parentTo(card, outer)
	parentTo(label, card)
	check("findGroup finds the nearest unnamed group", scope.findGroup(label, "") == card)
	check("findGroup skips to the named group", scope.findGroup(label, "outer") == outer)
	check("findGroup never answers with the element itself", scope.findGroup(card, "") == nil)
end

do
	local parent = fakeInstance("Frame")
	local element = fakeInstance("Frame", { "VelaPeer" })
	local unnamed = fakeInstance("TextBox", { "VelaPeer" })
	local named = fakeInstance("Frame", { "VelaPeer/x" })
	for _, child in { element, unnamed, named } do
		parentTo(child, parent)
	end
	local found = scope.findPeers(element, "")
	check("findPeers finds the marked siblings but not the element", #found == 1 and found[1] == unnamed)
	check("findPeers reads a named peer", scope.findPeers(element, "x")[1] == named)
end

do
	local card = fakeInstance("Frame", { "VelaGroup" })
	local label = fakeInstance("TextLabel")
	local seen = {}
	local stop = scope.watch(label, { groups = { "" }, peers = {} }, function(scopes)
		table.insert(seen, scopes.groups[""].hovered)
	end)
	check("an idle group reports nothing", #seen == 0)
	parentTo(label, card)
	card.MouseEnter:Fire()
	check("a group found after parenting reports its hover", seen[#seen] == true, `{#seen} reports`)
	card.MouseLeave:Fire()
	check("the group's hover ends with it", seen[#seen] == false)

	local other = fakeInstance("TextLabel")
	parentTo(other, card)
	local stopOther = scope.watch(other, { groups = { "" }, peers = {} }, function() end)
	check("two readers share one observation", card.MouseEnter:Count() == 1, `{card.MouseEnter:Count()}`)
	card.MouseEnter:Fire()
	stop()
	check("the observation outlives one reader", card.MouseEnter:Count() == 1)
	local before = #seen
	card.MouseLeave:Fire()
	check("a disposed watcher hears nothing", #seen == before)
	stopOther()
	check("the last reader releases the group", card.MouseEnter:Count() == 0)
end

do
	local parent = fakeInstance("Frame")
	local field = fakeInstance("TextBox", { "VelaPeer/field" })
	local hint = fakeInstance("TextLabel")
	parentTo(hint, parent)
	local focused = false
	local stop = scope.watch(hint, { groups = {}, peers = { "field" } }, function(scopes)
		focused = scopes.peers.field.focused
	end)
	parentTo(field, parent)
	field.Focused:Fire()
	check("a peer that arrives later is followed", focused == true)
	parentTo(field, nil)
	check("a peer that leaves stops counting", focused == false)
	stop()
end

do
	local parent = fakeInstance("Frame")
	local fieldBox = fakeInstance("Frame", { "VelaMarginBox" })
	local field = fakeInstance("TextBox", { "VelaPeer/field" })
	local hintBox = fakeInstance("Frame", { "VelaMarginBox" })
	local hint = fakeInstance("TextLabel")
	parentTo(field, fieldBox)
	parentTo(hint, hintBox)
	parentTo(hintBox, parent)
	check("a margin box takes the element's slot", scope.slotOf(hint) == hintBox)
	local focused = false
	local stop = scope.watch(hint, { groups = {}, peers = { "field" } }, function(scopes)
		focused = scopes.peers.field.focused
	end)
	parentTo(fieldBox, parent)
	check("findPeers looks beside the margin box and into the others", scope.findPeers(hint, "field")[1] == field)
	field.Focused:Fire()
	check("a peer in a margin box is followed", focused == true)
	parentTo(fieldBox, nil)
	check("a peer whose margin box leaves stops counting", focused == false)
	stop()
end

do
	local card = fakeInstance("Frame")
	local label = fakeInstance("TextLabel")
	parentTo(label, card)
	local seen = {}
	local stop = scope.watch(label, { groups = { "" }, peers = {} }, function(scopes)
		table.insert(seen, scopes.groups[""].hovered)
	end)
	addTag(card, "VelaGroup")
	task.wait()
	card.MouseEnter:Fire()
	check("a group marker added to an ancestor is followed", seen[#seen] == true, `{#seen} reports`)
	removeTag(card, "VelaGroup")
	task.wait()
	check("a group marker removed from an ancestor is let go", seen[#seen] == false)
	check("the untagged ancestor is no longer observed", card.MouseEnter:Count() == 0)
	stop()
end

do
	local parent = fakeInstance("Frame")
	local field = fakeInstance("TextBox")
	local hint = fakeInstance("TextLabel")
	parentTo(field, parent)
	parentTo(hint, parent)
	local focused = false
	local stop = scope.watch(hint, { groups = {}, peers = { "field" } }, function(scopes)
		focused = scopes.peers.field.focused
	end)
	addTag(field, "VelaPeer/field")
	task.wait()
	field.Focused:Fire()
	check("a peer marker added to a sibling is followed", focused == true)
	removeTag(field, "VelaPeer/field")
	task.wait()
	check("a peer marker removed from a sibling is let go", focused == false)
	stop()
end

do
	local first = fakeInstance("Frame")
	local second = fakeInstance("Frame")
	local firstLabel = fakeInstance("TextLabel")
	local secondLabel = fakeInstance("TextLabel")
	parentTo(firstLabel, first)
	parentTo(secondLabel, second)
	local stopFirst = scope.watch(firstLabel, { groups = { "" }, peers = {} }, function() end)
	local stopSecond = scope.watch(secondLabel, { groups = { "" }, peers = {} }, function() end)
	check("readers of one tag share its subscription", tagSignal("added", "VelaGroup"):Count() == 1)
	-- Tagged without the signal, so only a reader that was woken would bind it.
	table.insert(second.tags, "VelaGroup")
	addTag(first, "VelaGroup")
	task.wait()
	check("a marker wakes the readers under it", first.MouseEnter:Count() == 1)
	check("a marker leaves readers elsewhere asleep", second.MouseEnter:Count() == 0)
	stopFirst()
	stopSecond()
	check("the last reader drops the subscription", tagSignal("added", "VelaGroup"):Count() == 0)
	check("no tag stays followed", scope.followedTagCount() == 0)
end

do
	local variant = core.__VelaVariant
	local env = {
		width = 1920,
		rem = 16,
		orientation = "landscape",
		input = "mouse",
		colorScheme = "light",
		hovered = true,
		pressed = false,
		focused = false,
		groups = { card = { hovered = false, pressed = true, focused = false } },
		peers = { [""] = { hovered = true, pressed = false, focused = false } },
	}
	local function matches(prefix: string): boolean
		return variant.matchesRuntimeCondition(variant.parseVariantPrefix(prefix, { screens = {}, pluginVariants = {} }), env)
	end
	check("group-hover ignores the element's own hover", not matches("group-hover"))
	check("group-active/card reads the named group", matches("group-active/card"))
	check("peer-hover reads the unnamed peer", matches("peer-hover"))
	check("peer-hover/x reads nothing it was not given", not matches("peer-hover/x"))
	check("group-md is not a variant", variant.parseVariantPrefix("group-md", { screens = { md = 768 }, pluginVariants = {} }) == nil)
end

-- The differential lanes only show the two paths agree; these pin what they
-- agree on: a matching variant beats the base wherever it is written, a wider
-- breakpoint beats a narrower one, orientation and dark beat a breakpoint, and
-- one condition falls to the last class.
do
	local theme = core.__VelaEnv.normalizeTheme({
		theme = { colors = {}, radius = {}, spacing = {}, fontFamily = {}, screens = {} },
		plugins = { utilities = {} },
	} :: any)
	local function background(className: string?, overrides: { [string]: any }, rules: { any }?): any
		local env: { [string]: any } = {
			width = 1920,
			rem = core.__VelaRem.base(),
			orientation = "landscape",
			input = "mouse",
			colorScheme = "light",
			hovered = false,
			pressed = false,
			focused = false,
			attributes = {},
		}
		for key, value in overrides do
			env[key] = value
		end
		return core.__VelaResolution.resolveRuntimeResolution(theme, env, rules or {}, className, false, "frame").props.BackgroundColor3
	end
	local function rule(condition: any, className: string): any
		local color = background(className, {})
		local value = `Color3.fromRGB({math.round(color.R * 255)}, {math.round(color.G * 255)}, {math.round(color.B * 255)})`
		return {
			condition = condition,
			effects = { props = { { name = "BackgroundColor3", value = value } }, helpers = {} },
		}
	end
	local red, blue = background("bg-red-500", {}), background("bg-blue-500", {})
	local lg = { kind = "width", alias = "lg", minWidth = 1024 }
	local md = { kind = "width", alias = "md", minWidth = 768 }

	check("a variant written first still beats the base", background("hover:bg-blue-500 bg-red-500", { hovered = true }) == blue)
	check("the base holds while the variant does not apply", background("hover:bg-blue-500 bg-red-500", {}) == red)
	check("the wider breakpoint wins when both apply", background("lg:bg-red-500 md:bg-blue-500", {}) == red)
	check("the narrower breakpoint holds below the wider", background("lg:bg-red-500 md:bg-blue-500", { width = 900 }) == blue)
	check("a breakpoint beats a state", background("md:bg-red-500 hover:bg-blue-500", { hovered = true }) == red)
	check("dark beats a breakpoint", background("dark:bg-blue-500 md:bg-red-500", { colorScheme = "dark" }) == blue)
	check("an orientation beats a breakpoint", background("portrait:bg-blue-500 lg:bg-red-500", { orientation = "portrait" }) == blue)
	check(
		"dark rules beat breakpoint rules",
		background(nil, { colorScheme = "dark" }, { rule({ kind = "color-scheme", value = "dark" }, "bg-blue-500"), rule(md, "bg-red-500") })
			== blue
	)
	check("one condition falls to the last class", background("md:bg-blue-500 md:bg-red-500", {}) == red)
	check(
		"rules rank the same way",
		background(nil, {}, { rule(lg, "bg-red-500"), rule(md, "bg-blue-500") }) == red
	)
	check(
		"a rule's variant beats a class value's base",
		background("bg-red-500", { hovered = true }, { rule({ kind = "hover" }, "bg-blue-500") }) == blue
	)
end

-- What a host subscribes to has to see the variants a plugin body carries,
-- since resolution spells the plugin out before matching.
do
	local theme = core.__VelaEnv.normalizeTheme({
		theme = { colors = {}, radius = {}, spacing = {}, fontFamily = {}, screens = {} },
		plugins = { utilities = { card = "group-hover/card:bg-red-500 peer-focus:p-2 attr-[Selected=true]:ring-2" } },
	} :: any)
	local needs = core.__VelaResolution.scopeNeeds(theme, {}, "card")
	check("a plugin body's group is watched", needs.groups[1] == "card", `{#needs.groups} groups`)
	check("a plugin body's peer is watched", needs.peers[1] == "", `{#needs.peers} peers`)
	local names = core.__VelaResolution.attributeNames(theme, {}, "md:card")
	check("a plugin body's attribute is watched", names[1] == "Selected", `{#names} names`)
end

-- A margin box carries the layout props, so a transition holds and tweens each
-- instance's share on its own, the box's margin included in its Size.
do
	local motion, margin = core.__VelaMotion, core.__VelaMargin
	local UDim2, Color3 = roblox.UDim2, roblox.Color3
	local spacing = { top = 16, right = 16, bottom = 16, left = 16 }
	local red = Color3.new(1, 0, 0)
	local function render(width: number): ({ [string]: any }, { [string]: any })
		local props: { [string]: any } = {
			Size = UDim2.fromOffset(width, 40),
			Position = UDim2.fromOffset(10, 0),
			BackgroundColor3 = red,
			BackgroundTransparency = 0.5,
		}
		return props, margin.prepareMarginWrapper(spacing, props)
	end

	local held, heldBox = {}, {}
	local props, box = render(80)
	local goal = motion.holdTweenGoal(props, held, "all")
	local boxGoal = motion.holdTweenGoal(box, heldBox, "all", margin.isMarginWrapperProp)
	check("the box tweens its size with the margin", boxGoal.Size == UDim2.fromOffset(112, 72))
	check("the box tweens its position", boxGoal.Position == UDim2.fromOffset(10, 0))
	check("the box keeps its own transparency out of the tween", boxGoal.BackgroundTransparency == nil)
	check("the element keeps what stayed on it", goal.BackgroundColor3 == red and goal.BackgroundTransparency == 0.5)
	check("the element leaves the layout props to the box", goal.Position == nil and goal.Size == UDim2.fromScale(1, 1))

	local _, wider = render(160)
	local widerGoal = motion.holdTweenGoal(wider, heldBox, "all", margin.isMarginWrapperProp)
	check("the box renders the held size while the tween runs", wider.Size == UDim2.fromOffset(112, 72))
	local changed = motion.changedGoal(boxGoal, widerGoal)
	check(
		"only the box's size moves",
		changed ~= nil and changed.Size == UDim2.fromOffset(192, 72) and changed.Position == nil
	)
	check("a goal that did not move changes nothing", motion.changedGoal(widerGoal, widerGoal) == nil)

	local _, colored = render(80)
	check(
		"a colour transition leaves the box alone",
		next(motion.holdTweenGoal(colored, {}, "colors", margin.isMarginWrapperProp)) == nil
	)
end

if failures > 0 then
	print(`parity-harness units: {failures} failed`)
	process.exit(1)
end
print("parity-harness units: ok")
