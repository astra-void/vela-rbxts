--!strict
-- Resolves every case of a job twice, once the way the compiler lowered it and
-- once through runtime-core, and writes both sides in one canonical form.

local fs = require("@lune/fs")
local luau = require("@lune/luau")
local process = require("@lune/process")
local serde = require("@lune/serde")

local shim = require("./rbxts-shim")

local jobPath, resultPath = process.args[1], process.args[2]
assert(jobPath and resultPath, "usage: lune run driver.luau <job.json> <result.json>")

local job = serde.decode("json", fs.readFile(jobPath))
local core = shim.load(job.out)

local function round(value: number, places: number): number
	local scale = 10 ^ places
	return math.round(value * scale) / scale
end

local function number(value: number): any
	if value == math.huge then
		return "inf"
	end
	if value == -math.huge then
		return "-inf"
	end
	return value
end

local function color(value: Color3)
	return { math.round(value.R * 255), math.round(value.G * 255), math.round(value.B * 255) }
end

local function serialize(value: any): any
	if shim.isFakeEnumItem(value) then
		return { t = "EnumItem", v = tostring(value) }
	end

	local kind = typeof(value)
	if kind == "number" then
		return { t = kind, v = number(value) }
	elseif kind == "string" or kind == "boolean" then
		return { t = kind, v = value }
	elseif kind == "Color3" then
		return { t = kind, v = color(value) }
	elseif kind == "UDim" then
		return { t = kind, v = { value.Scale, value.Offset } }
	elseif kind == "UDim2" then
		return { t = kind, v = { value.X.Scale, value.X.Offset, value.Y.Scale, value.Y.Offset } }
	elseif kind == "Vector2" then
		return { t = kind, v = { number(value.X), number(value.Y) } }
	elseif kind == "EnumItem" then
		return { t = kind, v = tostring(value) }
	elseif kind == "Font" then
		return { t = kind, v = { value.Family, tostring(value.Weight), tostring(value.Style) } }
	elseif kind == "ColorSequence" then
		local keypoints = {}
		for _, keypoint in value.Keypoints do
			local rgb = color(keypoint.Value)
			table.insert(keypoints, { round(keypoint.Time, 4), rgb[1], rgb[2], rgb[3] })
		end
		return { t = kind, v = keypoints }
	elseif kind == "NumberSequence" then
		local keypoints = {}
		for _, keypoint in value.Keypoints do
			table.insert(keypoints, { round(keypoint.Time, 4), keypoint.Value, keypoint.Envelope })
		end
		return { t = kind, v = keypoints }
	elseif kind == "NumberRange" then
		return { t = kind, v = { value.Min, value.Max } }
	end
	return { t = kind, v = tostring(value) }
end

-- The IR holds roblox-ts expressions. Rewritten to Luau and run through the real
-- constructors, they meet the same int32 offsets and float32 scales the runtime's
-- values do, so precision is not mistaken for a divergence.
local function toLuau(expression: string): string
	local out = {}
	local index = 1
	local length = #expression
	while index <= length do
		local char = string.sub(expression, index, index)
		if char == '"' or char == "'" then
			local close = index + 1
			while close <= length and string.sub(expression, close, close) ~= char do
				if string.sub(expression, close, close) == "\\" then
					close += 1
				end
				close += 1
			end
			table.insert(out, string.sub(expression, index, close))
			index = close + 1
		elseif char == "[" then
			table.insert(out, "{")
			index += 1
		elseif char == "]" then
			table.insert(out, "}")
			index += 1
		else
			local name = string.match(expression, "^new%s+([%a_][%w_]*)%s*%(", index)
			if name then
				table.insert(out, name .. ".new(")
				index = select(2, string.find(expression, "^new%s+[%a_][%w_]*%s*%(", index)) + 1
			else
				table.insert(out, char)
				index += 1
			end
		end
	end
	return table.concat(out)
end

local expressionEnv = shim.environment({ math = math })
local evaluated: { [string]: any } = {}
local function evaluate(expression: string): any
	local cached = evaluated[expression]
	if cached ~= nil then
		return cached
	end

	local chunk = luau.load("return " .. toLuau(expression), {
		debugName = expression,
		environment = expressionEnv,
	})
	local value = chunk()
	evaluated[expression] = value
	return value
end

local function staticProps(entries: { any }): { [string]: any }
	local props = {}
	for _, entry in entries do
		props[entry.name] = evaluate(entry.value)
	end
	return props
end

local function serializeProps(props: { [string]: any }): { [string]: any }
	local out = {}
	for name, value in props do
		out[name] = serialize(value)
	end
	return out
end

local function serializeHelpers(helpers: { [string]: { [string]: any } }): { [string]: any }
	local out = {}
	for tag, props in helpers do
		out[tag] = serializeProps(props)
	end
	return out
end

local function noneToNil(value: string?): string?
	if value == "none" then
		return nil
	end
	return value
end

local function environment(overrides: { [string]: any }?)
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
	if overrides then
		for key, value in overrides do
			env[key] = value
		end
	end
	return env
end

type Side = {
	props: { [string]: any },
	helpers: { [string]: any },
	margin: any,
	divide: any,
	transition: any,
	animation: string?,
	text: any,
	opacityAlpha: number?,
}

-- Separators are children, so both hosts fade them with the alpha the element
-- resolved for its subtree, which a CanvasGroup composites itself.
local function finishDivide(tag: string?, resolution: any, shipped: any, remRatio: number): any
	local divide = core.__VelaDivide.resolveDivideConfig(shipped, resolution.divide, remRatio)
	local alpha = resolution.opacityAlpha
	if divide ~= nil and tag ~= nil and tag ~= "canvasgroup" and alpha ~= nil and alpha < 1 then
		divide.transparency = core.__VelaDivide.separatorTransparency(divide, alpha)
	end
	return divide
end

-- Mirrors the order both hosts finish a resolution in: the props the element
-- shipped with, then what resolved, then the composers and the helper defaults.
-- `ir` is what the compiler handed the host, absent for a bare class value, and
-- `className` what it forwarded beside it.
local function finish(theme: any, env: any, case: any, className: string?, ir: any?): Side
	local shipped = ir or { base = { props = {}, helpers = {} }, runtimeRules = {} }
	local resolution =
		core.__VelaResolution.resolveRuntimeResolution(theme, env, shipped.runtimeRules, className, false, case.tag)

	local hostProps = staticProps(shipped.base.props)
	for name, value in resolution.props do
		hostProps[name] = value
	end
	core.__VelaApply.applyComposedResolution(hostProps, resolution, false)
	core.__VelaApply.applyHelperDefaults(resolution.helpers)

	local helpers: { [string]: { [string]: any } } = {}
	for _, helper in shipped.base.helpers do
		helpers[helper.tag] = staticProps(helper.props)
	end
	for _, helper in resolution.helpers do
		local props = helpers[helper.tag] or {}
		for _, prop in helper.props do
			props[prop.name] = prop.value
		end
		helpers[helper.tag] = props
	end

	local text = shipped.text or {}
	local remRatio = resolution.remRatio or 1
	-- A component decides its own rendering, so neither host tweens or animates it.
	local instanceCapable = case.tag ~= nil
	return {
		props = serializeProps(hostProps),
		helpers = serializeHelpers(helpers),
		margin = core.__VelaMargin.resolveMarginConfig(shipped.margin, resolution.margin, remRatio),
		divide = finishDivide(case.tag, resolution, shipped.divide, remRatio),
		transition = if instanceCapable
			then core.__VelaMotion.resolveTransitionConfig(shipped.transition, resolution.transition)
			else nil,
		animation = if instanceCapable then resolution.animation or shipped.animation else nil,
		text = {
			transform = noneToNil(resolution.textTransform or text.transform),
			decoration = noneToNil(resolution.textDecoration or text.decoration),
		},
		opacityAlpha = resolution.opacityAlpha or shipped.opacityAlpha,
	}
end

local function staticSide(ir: any): Side
	local helpers = {}
	for _, helper in ir.base.helpers do
		helpers[helper.tag] = staticProps(helper.props)
	end
	-- A divided list's layout reaches the host as an unconditional rule, which
	-- is still the base.
	for _, rule in ir.runtimeRules do
		if rule.condition.kind == "all" and #rule.condition.conditions == 0 then
			for _, helper in rule.effects.helpers do
				helpers[helper.tag] = staticProps(helper.props)
			end
		end
	end
	local text = ir.text or {}
	return {
		props = serializeProps(staticProps(ir.base.props)),
		helpers = serializeHelpers(helpers),
		margin = ir.margin,
		divide = ir.divide,
		transition = ir.transition,
		animation = ir.animation,
		text = { transform = text.transform, decoration = text.decoration },
		opacityAlpha = ir.opacityAlpha,
	}
end

local results = {}
for _, suite in job.suites do
	core.__VelaRem.configure(suite.config.theme.rem)
	local theme = core.__VelaEnv.normalizeTheme(suite.config)

	for _, case in suite.cases do
		local ok, outcome = pcall(function()
			local env = environment(case.env)
			local expected = if case.lane == "static"
				then staticSide(case.ir)
				else finish(theme, env, case, case.ir.runtimeClasses, case.ir)
			return { expected = expected, actual = finish(theme, env, case, case.className) }
		end)

		if ok then
			table.insert(results, { id = case.id, expected = outcome.expected, actual = outcome.actual })
		else
			table.insert(results, { id = case.id, error = tostring(outcome) })
		end
	end
end

fs.writeFile(resultPath, serde.encode("json", results))
