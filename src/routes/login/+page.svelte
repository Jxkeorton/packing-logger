<script lang="ts">
  import type { ActionData } from './$types';

  let { form }: { form: ActionData } = $props();
</script>

<svelte:head>
  <title>Packing Log — Sign in</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<main class="wrap">
  <form class="card" method="POST">
    <h1 class="title">Packing Log</h1>
    <p class="subtitle">Enter the password to continue.</p>
    <input
      class="field"
      type="password"
      name="password"
      placeholder="Password"
      autocomplete="current-password"
      autofocus
      required
    />
    {#if form?.error}<p class="error">Wrong password — try again.</p>{/if}
    <button class="submit" type="submit">Sign in</button>
  </form>
</main>

<style>
  .wrap {
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }

  .card {
    width: 100%;
    max-width: 360px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    padding: 32px 28px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .title {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 24px;
    letter-spacing: -0.01em;
  }

  .subtitle {
    margin: 0 0 18px;
    color: var(--ink-soft);
    font-size: 14px;
  }

  .field {
    appearance: none;
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 14px 14px;
    font-size: 16px;
    font-family: inherit;
    color: var(--ink);
    background: var(--canvas);
  }

  .field:focus-visible {
    outline: 3px solid var(--gold);
    outline-offset: 1px;
  }

  .error {
    margin: 10px 0 0;
    color: var(--danger);
    font-size: 13px;
  }

  .submit {
    appearance: none;
    border: none;
    margin-top: 16px;
    height: 52px;
    border-radius: 999px;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 16px;
    color: #fff;
    background: var(--gold);
    cursor: pointer;
    touch-action: manipulation;
  }

  .submit:active {
    transform: scale(0.97);
  }
</style>
