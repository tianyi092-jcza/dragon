<script setup>
import { ElIcon } from 'element-plus/es/components/icon/index.mjs';
defineProps({ name: String });
// Original project SVG paths; no external icon assets or additional dependency.
const paths = {
  copy: 'M12 4v16M4 12h16',
  'draft-editor': 'M4 5h16v14H4zM8 9h8M8 13h5',
  admin: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M2 21v-3a7 7 0 0 1 14 0v3M17 4a4 4 0 0 1 0 8M19 15a5 5 0 0 1 3 6',
  'catalog-editor': 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  'stronghold-editor': 'M3 21V7h4v4h3V4h4v7h3V7h4v14zM10 21v-6h4v6',
  'mapview-editor': 'M3 5l6-2 6 2 6-2v16l-6 2-6-2-6 2zM9 3v16M15 5v16',
  'generals-editor': 'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8M4 21v-3a8 8 0 0 1 16 0v3',
  'chapters-editor': 'M3 4h7l2 2 2-2h7v16h-7l-2 2-2-2H3zM12 6v16',
  'publish-editor': 'M12 16V3M7 8l5-5 5 5M4 14v7h16v-7',
  'management-editor': 'M5 3h14v18H5zM8 12l3 3 5-6',
  'copy-game-editor': 'M8 8h13v13H8zM16 5V3H3v13h2',
  'base-map-editor': 'M2 8l10-5 10 5-10 5zM2 13l10 5 10-5M2 18l10 5 10-5',
  collapse: 'M15 4l-8 8 8 8', expand: 'M9 4l8 8-8 8',
  info: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M12 10v7M12 6v1',
  visible: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  hidden: 'M3 3l18 18M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12',
  locked: 'M5 10h14v12H5zM8 10V6a4 4 0 0 1 8 0v4',
  unlocked: 'M5 10h14v12H5zM8 10V6a4 4 0 0 1 8 0',
};
</script>
<template><ElIcon><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="paths[name] || paths.info" /></svg></ElIcon></template>
