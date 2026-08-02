const GALLERY_ENDPOINT =
	"https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery";
const FILTER_TYPE_EXTENSION_NAME = 7;
const FLAG_INCLUDE_VERSIONS = 0x1;

type GalleryResponse = {
	results?: Array<{
		extensions?: Array<{
			extensionName?: string;
			publisher?: { publisherName?: string };
			versions?: Array<{ version?: string }>;
		}>;
	}>;
};

// The gallery answers an unpublished extension with an empty result rather than
// a 404, which is the first release of any extension.
export async function fetchPublishedVsixVersions(extensionId: string) {
	const response = await fetch(GALLERY_ENDPOINT, {
		method: "POST",
		headers: {
			accept: "application/json;api-version=3.0-preview.1",
			"content-type": "application/json",
		},
		body: JSON.stringify({
			filters: [
				{
					criteria: [
						{ filterType: FILTER_TYPE_EXTENSION_NAME, value: extensionId },
					],
					pageNumber: 1,
					pageSize: 1,
				},
			],
			flags: FLAG_INCLUDE_VERSIONS,
		}),
	});

	if (!response.ok) {
		throw new Error(
			`VS Code Marketplace query for ${extensionId} failed with ${response.status} ${response.statusText}.`,
		);
	}

	const payload = (await response.json()) as GalleryResponse;
	const extension = payload.results?.[0]?.extensions?.[0];
	if (!extension) {
		return [];
	}

	const versions = new Set<string>();
	for (const entry of extension.versions ?? []) {
		const version = entry.version?.trim();
		if (version) {
			versions.add(version);
		}
	}

	return [...versions];
}
