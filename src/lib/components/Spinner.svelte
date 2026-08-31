<script lang="ts">
  // Small inline loading indicator for a button mid-operation — stroke is
  // currentColor throughout, so it always matches whatever text colour
  // the button it's dropped into already has (white on a gold Save
  // button, ink-soft on an icon-only star/delete button, etc.) with no
  // colour prop to keep in sync.
  let { size = 15 }: { size?: number } = $props();
</script>

<svg
  class="spinner"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  role="status"
  aria-label="Loading"
>
  <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" opacity="0.3" />
  <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
</svg>

<style>
  .spinner {
    animation: spinner-rotate 0.7s linear infinite;
    flex: none;
  }

  @keyframes spinner-rotate {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .spinner {
      animation-duration: 1.6s;
    }
  }
</style>
