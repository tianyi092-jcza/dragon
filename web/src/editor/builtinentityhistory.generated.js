// Trusted immutable author-source history; entries are not arbitrary draft URLs.
function freeze(value) { if (value && typeof value === "object") { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; }
export const BUILTIN_ENTITY_HISTORY = freeze([
  {
    "sourceRevision": "map-2-844eab32a84212f72b1430d398f5e82a3924d7e9527746fc2d1c7581cf694f86",
    "dataURL": "content/builtin/compiled/map-2-844eab32a84212f72b1430d398f5e82a3924d7e9527746fc2d1c7581cf694f86/data.json",
    "descriptor": {
      "schemaVersion": 1,
      "mode": "READONLY_IMPORT_INPUT",
      "manifestURL": "content/builtin/authoring/entities-5f65f15123622c916e9ea8ee37800b01e5a74909197d06051a5855a7b60e6c9c/manifest.json",
      "manifestSha256": "9a0ca1041aca47fa285d69c1728c6b3a2bc2c5d8d339c45549c1984fd83250fe",
      "manifestByteLength": 854,
      "resourceURL": "content/builtin/authoring/entities-5f65f15123622c916e9ea8ee37800b01e5a74909197d06051a5855a7b60e6c9c/entity-source.json",
      "resource": {
        "path": "entity-source.json",
        "sha256": "5f65f15123622c916e9ea8ee37800b01e5a74909197d06051a5855a7b60e6c9c",
        "byteLength": 503775
      },
      "runtimeDataSha256": "07c87416eca84be738b5a744c2e5c75828280b1b183a96b7de614ef3d76059fb",
      "sourceChapterOrder": [
        "upper-1",
        "upper-2",
        "upper-3",
        "upper-4",
        "middle-1",
        "middle-2",
        "middle-3",
        "middle-4",
        "lower-1",
        "lower-2",
        "lower-3",
        "lower-4",
        "later-1",
        "later-2",
        "later-3",
        "later-4",
        "original-1",
        "original-2",
        "original-3",
        "original-4"
      ],
      "originalSources": {
        "../上/SINARIO.DAT": "6183b6b2883fb1cd9c6d7c7d0def86049b7707a64d9258836940900a09454d73",
        "../中/SINARIO.DAT": "cf91e4360fa4e9363b5136ba379d58c8b1c8b5b3ca309eca4071b4f7a805ce59",
        "../下/SINARIO.DAT": "89406f442dad626cea8df87d3c3ffb049a784a97da996caa13ae82622a1e8ffb",
        "../后/SINARIO.DAT": "3e70ad54e3fc3b9d13a25883098d1ccc53218aafd1a7a461b095c1f1fc9812db",
        "../原版/SINARIO.DAT": "4ad37ad619649bf9ca2f075ffe483ff67f205fafa1e2d7b4926dc2598ec08c87"
      }
    }
  }
]);
