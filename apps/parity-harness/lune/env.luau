--!strict
-- Checks the shared environment store in runtime-core/out/env.luau against
-- stand-in services whose signals count their connections and can be fired.

local process = require("@lune/process")
local roblox = require("@lune/roblox") :: any
local task = require("@lune/task")

local shim = require("./rbxts-shim")

local outDir = process.args[1]
assert(outDir, "usage: lune run env.luau <runtime-core/out>")

local Vector2 = roblox.Vector2
local SCHEME = "VelaColorScheme"

local signals: { any } = {}

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
	table.insert(signals, signal)
	return signal
end

local function withPropertySignals(object: any): any
	local byName: { [string]: any } = {}
	function object:GetPropertyChangedSignal(name: string)
		byName[name] = byName[name] or fakeSignal()
		return byName[name]
	end
	function object:Set(name: string, value: any)
		self[name] = value
		self:GetPropertyChangedSignal(name):Fire()
	end
	return object
end

local function fakeCamera(width: number, height: number): any
	return withPropertySignals({ ViewportSize = Vector2.new(width, height) })
end

local function fakePlayer(scheme: string?): any
	local attributes: { [string]: any } = { [SCHEME] = scheme }
	local byName: { [string]: any } = {}
	local player: any = {}
	function player:GetAttribute(name: string)
		return attributes[name]
	end
	function player:GetAttributeChangedSignal(name: string)
		byName[name] = byName[name] or fakeSignal()
		return byName[name]
	end
	function player:SetAttribute(name: string, value: any)
		attributes[name] = value
		self:GetAttributeChangedSignal(name):Fire()
	end
	return player
end

local function liveConnections(): number
	local total = 0
	for _, signal in signals do
		total += signal:Count()
	end
	return total
end

-- A fresh module graph per scenario, so each starts from an unconnected store.
local function world()
	table.clear(signals)
	local camera = fakeCamera(1920, 1080)
	local services = {
		Players = withPropertySignals({}),
		UserInputService = withPropertySignals({
			TouchEnabled = false,
			MouseEnabled = true,
			GamepadEnabled = false,
		}),
		Workspace = withPropertySignals({ CurrentCamera = camera }),
	}
	for name, service in services do
		shim.services[name] = service
	end
	local core = shim.load(outDir)
	return core.__VelaEnv, services, camera
end

local failures = 0
local function check(name: string, ok: boolean, detail: string?)
	if not ok then
		failures += 1
		print(`  env: {name}{if detail then `: {detail}` else ""}`)
	end
end

local function recorder(env: any)
	local heard = {}
	local unsubscribe = env.subscribeEnvironment(function(environment)
		table.insert(heard, environment)
	end)
	return heard, unsubscribe
end

do
	local env, services = world()
	check("nothing connects before the store is read", liveConnections() == 0, `{liveConnections()}`)
	check("no listeners before any subscribe", env.listenerCount() == 0)

	local first = recorder(env)
	local connections = liveConnections()
	check("the first subscriber connects the store", connections > 0)

	local others = {}
	for _ = 1, 50 do
		local heard, unsubscribe = recorder(env)
		table.insert(others, { heard = heard, unsubscribe = unsubscribe })
	end
	env.currentEnvironment()
	check(
		"one connection set however many subscribe",
		liveConnections() == connections,
		`{connections} became {liveConnections()}`
	)
	check("listenerCount counts every subscriber", env.listenerCount() == 51, `{env.listenerCount()}`)
	check("subscribing alone notifies nobody", #first == 0)

	services.UserInputService:GetPropertyChangedSignal("TouchEnabled"):Fire()
	services.UserInputService:Set("MouseEnabled", false)
	check("a signal that moved nothing resolution reads is not a change", #first == 0, `{#first}`)

	services.UserInputService:Set("TouchEnabled", true)
	check("a touch device is heard once", #first == 1 and first[1].input == "touch", `{#first}`)
	check("every subscriber hears it once", #others[50].heard == 1)
	check("the current environment follows", env.currentEnvironment().input == "touch")

	services.UserInputService:Set("GamepadEnabled", true)
	check("a gamepad takes over", #first == 2 and first[2].input == "gamepad")

	others[1].unsubscribe()
	others[1].unsubscribe()
	check("unsubscribing drops one listener", env.listenerCount() == 50, `{env.listenerCount()}`)
	services.UserInputService:Set("GamepadEnabled", false)
	check("an unsubscribed listener hears nothing more", #others[1].heard == 2, `{#others[1].heard}`)
	check("the rest still hear", #others[2].heard == 3 and others[2].heard[3].input == "touch")

	for index = 2, 50 do
		others[index].unsubscribe()
	end
	check("listenerCount follows unsubscribes", env.listenerCount() == 1, `{env.listenerCount()}`)
	recorder(env)
	check("subscribing again reuses the connections", liveConnections() == connections)
end

do
	local env, services = world()
	local heard = recorder(env)
	check("the scheme is light while there is no player", env.currentEnvironment().colorScheme == "light")

	local player = fakePlayer("dark")
	services.Players:Set("LocalPlayer", player)
	check("a late LocalPlayer is read at once", #heard == 1 and heard[1].colorScheme == "dark", `{#heard}`)
	check(
		"a late LocalPlayer's attribute is watched",
		player:GetAttributeChangedSignal(SCHEME):Count() == 1
	)

	player:SetAttribute(SCHEME, "light")
	check("the attribute is followed live", #heard == 2 and heard[2].colorScheme == "light")
	player:SetAttribute(SCHEME, "light")
	check("rewriting the same scheme is not a change", #heard == 2)

	local replacement = fakePlayer("dark")
	services.Players:Set("LocalPlayer", replacement)
	check("a replaced player is let go", player:GetAttributeChangedSignal(SCHEME):Count() == 0)
	check("the new player is watched", replacement:GetAttributeChangedSignal(SCHEME):Count() == 1)
	check("the new player's scheme applies", #heard == 3 and heard[3].colorScheme == "dark")
	player:SetAttribute(SCHEME, "light")
	check("the old player's attribute is not heard", #heard == 3)
end

do
	local env, services, camera = world()
	local heard = recorder(env)
	check("the first read sees the viewport", env.currentEnvironment().width == 1920)

	camera:Set("ViewportSize", Vector2.new(700, 1000))
	check("a resize is heard at once", #heard == 1 and heard[1].width == 700 and heard[1].orientation == "portrait")
	task.wait(0.3)

	local swapped = fakeCamera(700, 1000)
	services.Workspace:Set("CurrentCamera", swapped)
	task.wait(0.3)
	check("a camera swap at the same size is not a change", #heard == 1, `{#heard}`)
	check("the old camera is let go", camera:GetPropertyChangedSignal("ViewportSize"):Count() == 0)

	swapped:Set("ViewportSize", Vector2.new(1280, 720))
	check("the new camera is followed", #heard == 2 and heard[2].width == 1280, `{#heard}`)
end

do
	local env, services = world()
	local order = {}
	env.subscribeEnvironment(function()
		table.insert(order, "first")
		env.subscribeEnvironment(function()
			table.insert(order, "late")
		end)
	end)

	services.UserInputService:Set("TouchEnabled", true)
	check("a listener added mid-round waits for the next change", table.concat(order, ",") == "first", table.concat(order, ","))
	check("a listener added mid-round counts", env.listenerCount() == 2, `{env.listenerCount()}`)
end

if failures > 0 then
	print(`parity-harness env: {failures} failed`)
	process.exit(1)
end
print("parity-harness env: ok")
