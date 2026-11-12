<script setup>
import { ElPagination } from 'element-plus/es/components/pagination/index.mjs';

defineProps({
  currentPage: { type: Number, required: true },
  pageSize: { type: Number, required: true },
  total: { type: Number, required: true },
  pageSizes: { type: Array, default: () => [25, 50, 100] },
  disabled: Boolean,
});
const emit = defineEmits(['update:currentPage', 'update:pageSize']);
</script>

<template>
  <ElPagination class="list-pagination" :current-page="currentPage" :page-size="pageSize" :total="total" :page-sizes="pageSizes" :disabled="disabled" :layout="pageSizes.length > 1 ? 'total, sizes, prev, pager, next, jumper' : 'total, prev, pager, next, jumper'" @update:current-page="emit('update:currentPage', $event)" @update:page-size="emit('update:pageSize', $event)" />
</template>

<style scoped>
.list-pagination { flex-shrink: 0; flex-wrap: wrap; row-gap: 8px; padding: 12px 0; }
</style>
