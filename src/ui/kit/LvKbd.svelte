<script lang="ts">
    let { k }: { /** 键位名，如 "1"、"Space" */ k: string } = $props();
</script>

<kbd aria-hidden="true" class="lv-kbd2">{k}</kbd>
