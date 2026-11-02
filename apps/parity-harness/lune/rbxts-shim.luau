--!strict
-- Loads roblox-ts output (runtime-core/out) under Lune: the TS runtime library,
-- script instances and the services the modules import are all stood in for.

local fs = require("@lune/fs")
local luau = require("@lune/luau")
local roblox = require("@lune/roblox") :: any
local serde = require("@lune/serde")
local task = require("@lune/task")

local shim = {}

local DATATYPES = {
	"Color3",
	"UDim",
	"UDim2",
	"Vector2",
	"ColorSequence",
	"ColorSequenceKeypoint",
	"NumberSequence",
	"NumberSequenceKeypoint",
	"NumberRange",
	"Font",
}

local FakeEnumItem = {}
FakeEnumItem.__index = FakeEnumItem
FakeEnumItem.__tostring = function(item)
	return item.__path
end

-- Lune's reflection database lags the engine, so an enum it lacks resolves to
-- items that compare by identity and print the way real ones do.
local fakeEnums: { [string]: any } = {}
local function fakeEnum(name: string)
	local existing = fakeEnums[name]
	if existing then
		return existing
	end

	local enum = setmetatable({}, {
		__index = function(self, item: string)
			local value = setmetatable({
				__path = `Enum.{name}.{item}`,
				Name = item,
			}, FakeEnumItem)
			rawset(self, item, value)
			return value
		end,
	})
	fakeEnums[name] = enum
	return enum
end

shim.Enum = setmetatable({}, {
	__index = function(_, name: string)
		local ok, real = pcall(function()
			return roblox.Enum[name]
		end)
		if ok and real ~= nil then
			return real
		end
		return fakeEnum(name)
	end,
})

function shim.isFakeEnumItem(value: any): boolean
	return type(value) == "table" and getmetatable(value) == FakeEnumItem
end

local function shimTypeof(value: any): string
	if shim.isFakeEnumItem(value) then
		return "EnumItem"
	end
	return typeof(value)
end

-- `typeIs(x, "EnumItem")` compiles to `typeof(x) == "EnumItem"`, so the stand-in
-- items have to answer to it.
function shim.environment(extra: { [string]: any }?): { [string]: any }
	local env: { [string]: any } = {
		Enum = shim.Enum,
		typeof = shimTypeof,
		task = task,
	}
	for _, name in DATATYPES do
		env[name] = roblox[name]
	end
	if extra then
		for key, value in extra do
			env[key] = value
		end
	end
	return env
end

local function signal()
	return {
		Connect = function()
			return { Disconnect = function() end }
		end,
	}
end

-- Services a caller stands in for before `shim.load`, read in place of the stub.
shim.services = {} :: { [string]: any }

-- Every service member the modules touch at load or on first use: methods
-- return a signal-shaped value, properties read as nil.
local servicesStub = setmetatable({}, {
	__index = function(_, name: string)
		local provided = shim.services[name]
		if provided ~= nil then
			return provided
		end
		return setmetatable({}, {
			__index = function(_, key: string)
				if key == "CurrentCamera" or key == "LocalPlayer" then
					return nil
				end
				return function()
					return signal()
				end
			end,
		})
	end,
})

local SERVICES_SCOPE = { __services = true }

function shim.load(outDir: string)
	local cache: { [string]: any } = {}
	local TS = {}

	local function child(parent: any, name: string)
		return { Name = name, Parent = parent, __path = `{parent.__path}/{name}` }
	end

	local function loadModule(scriptObject: any)
		local path = scriptObject.__path
		local cached = cache[path]
		if cached ~= nil then
			return cached
		end

		local result
		if fs.isFile(path .. ".json") then
			result = serde.decode("json", fs.readFile(path .. ".json"))
		else
			local file = if fs.isFile(path .. ".luau") then path .. ".luau" else path .. "/init.luau"
			_G[scriptObject] = TS
			local chunk = luau.load(fs.readFile(file), {
				debugName = file,
				environment = shim.environment({ script = scriptObject }),
			})
			result = chunk()
		end

		cache[path] = result
		return result
	end

	function TS.import(_caller: any, parent: any, ...: string)
		if parent == SERVICES_SCOPE then
			return servicesStub
		end

		local target = parent
		for _, name in { ... } do
			target = child(target, name)
		end
		return loadModule(target)
	end

	function TS.getModule(_caller: any, _scope: string, _name: string)
		return SERVICES_SCOPE
	end

	return loadModule({ Name = "out", __path = outDir })
end

return shim
