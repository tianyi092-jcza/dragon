import { computed, ref, watch } from 'vue';

// Paginate the complete filtered/sorted DTO, never append rows on scroll.
export function usePagination(items) {
  const currentPage = ref(1);
  const pageSize = ref(25);
  const total = computed(() => items.value.length);
  const pagedRows = computed(() => {
    const start = (currentPage.value - 1) * pageSize.value;
    return items.value.slice(start, start + pageSize.value);
  });
  watch(pageSize, () => { currentPage.value = 1; });
  watch(total, value => {
    currentPage.value = Math.max(1, Math.min(currentPage.value, Math.ceil(value / pageSize.value)));
  });
  return { currentPage, pageSize, total, pagedRows };
}
