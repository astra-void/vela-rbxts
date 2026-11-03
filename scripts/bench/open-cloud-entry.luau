-- The Open Cloud Luau execution task script. open-cloud-specs.ts swaps in the request line.
local HttpService = game:GetService("HttpService")
local StarterPlayer = game:GetService("StarterPlayer")

local REQUEST = '{"kind":"spec"}'

local bench = StarterPlayer:FindFirstChild("StarterPlayerScripts")
bench = bench and bench:FindFirstChild("Bench")
local cloud = bench and bench:FindFirstChild("cloud")
if cloud == nil then
	error("StarterPlayer.StarterPlayerScripts.Bench.cloud is missing: upload a bench place", 0)
end

local report = require(cloud)(HttpService:JSONDecode(REQUEST))

return HttpService:JSONEncode(report)
