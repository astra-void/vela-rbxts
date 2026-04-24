export const RELEASE_TAG_PATTERN = /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export type PublicReleasePackage = {
  path: string;
  packageName: string;
};

export const PUBLIC_RELEASE_PACKAGES: PublicReleasePackage[] = [
  {
    path: "packages/types",
    packageName: "@vela-rbxts/types",
  },
  {
    path: "packages/config",
    packageName: "@vela-rbxts/config",
  },
  {
    path: "packages/ir",
    packageName: "@vela-rbxts/ir",
  },
  {
    path: "packages/core",
    packageName: "@vela-rbxts/core",
  },
  {
    path: "packages/compiler",
    packageName: "@vela-rbxts/compiler",
  },
  {
    path: "packages/runtime",
    packageName: "@vela-rbxts/runtime",
  },
  {
    path: "packages/rbxtsc-host",
    packageName: "@vela-rbxts/rbxtsc-host",
  },
  {
    path: "packages/vela-rbxts",
    packageName: "vela-rbxts",
  },
];

export const WORKSPACE_PUBLISH_ORDER = [
  "@vela-rbxts/types",
  "@vela-rbxts/config",
  "@vela-rbxts/ir",
  "@vela-rbxts/core",
  "@vela-rbxts/runtime",
  "@vela-rbxts/rbxtsc-host",
  "vela-rbxts",
] as const;
