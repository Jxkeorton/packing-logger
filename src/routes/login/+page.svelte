<script lang="ts">
  import type { ActionData, PageData } from './$types';
  import Spinner from '$lib/components/Spinner.svelte';

  let { data, form }: { data: PageData; form: ActionData } = $props();
  const multi = $derived(data.mode === 'multi');

  // This form is a plain native POST, not use:enhance — no per-request
  // JS lifecycle to hook a reset into, since a successful submit
  // navigates away entirely. `submitting` only ever needs to go one way:
  // true from the moment it's clicked so a second tap while the request
  // is in flight can't fire another login attempt. A wrong-password
  // response re-renders this page fresh from the server, which
  // re-initialises this state to false again on its own.
  //
  // The username/password fields use `readonly`, not `disabled`, once
  // submitting: a *disabled* form control's value is dropped from the
  // browser's own submission entirely, per spec — fine for use:enhance
  // forms elsewhere (their fetch reads FormData before this ever
  // renders), but this is a genuine native submit, so disabling these
  // two fields the instant they're clicked could race the browser's own
  // form-serialisation step and submit an empty field on some browsers
  // (reported by a user on iOS Safari as "definitely correct password"
  // still getting a 401). `readonly` still submits the field's current
  // value and still stops it being edited mid-submit.
  let submitting = $state(false);
</script>

<svelte:head>
  <title>Packing Log — Sign in</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<main class="wrap">
  <form class="card" method="POST" onsubmit={() => (submitting = true)}>
    <h1 class="title">Packing Log</h1>
    <p class="subtitle">{multi ? 'Sign in to continue.' : 'Enter the password to continue.'}</p>
    {#if multi}
      <input
        class="field"
        type="text"
        name="username"
        placeholder="Username"
        autocomplete="username"
        autofocus
        required
        readonly={submitting}
      />
    {/if}
    <input
      class="field"
      type="password"
      name="password"
      placeholder="Password"
      autocomplete="current-password"
      autofocus={!multi}
      required
      readonly={submitting}
    />
    {#if form?.error}<p class="error">{multi ? 'Wrong username or password — try again.' : 'Wrong password — try again.'}</p>{/if}
    <button class="submit" type="submit" disabled={submitting}>
      {#if submitting}<Spinner size={16} />{:else}Sign in{/if}
    </button>
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
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .submit:active {
    transform: scale(0.97);
  }

  .submit:disabled {
    opacity: 0.7;
    cursor: default;
  }

  .field:disabled,
  .field:read-only {
    opacity: 0.7;
  }
</style>
