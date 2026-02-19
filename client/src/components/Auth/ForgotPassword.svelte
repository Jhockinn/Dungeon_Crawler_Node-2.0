<script>
  import { createEventDispatcher } from 'svelte';
  import { forgotPassword } from '../../services/authService';
  import toast from 'svelte-french-toast';

  const dispatch = createEventDispatcher();

  let email = '';
  let loading = false;

  async function handleSubmit() {
    loading = true;

    try {
      await forgotPassword(email);
      toast.success('✅ Check your email! If an account exists, a reset link has been sent.', { duration: 5000 });
      email = '';
    } catch (err) {
      toast.error(err.message);
    } finally {
      loading = false;
    }
  }
</script>

<div class="forgot-password">
  <h2>🔑 Forgot Password</h2>
  
  <p class="description">
    Enter your email address and we'll send you a link to reset your password.
  </p>

  <form on:submit|preventDefault={handleSubmit}>
    <div class="form-group">
      <label for="email">Email:</label>
      <input 
        type="email" 
        id="email" 
        bind:value={email} 
        required 
        disabled={loading}
        placeholder="your@email.com"
      />
    </div>

    <div class="button-group">
      <button type="submit" disabled={loading}>
        {loading ? 'Sending...' : 'Send Reset Link'}
      </button>
      <button type="button" class="cancel-btn" on:click={() => dispatch('cancel')} disabled={loading}>
        Back to Login
      </button>
    </div>
  </form>
</div>

<style>
  .forgot-password {
    max-width: 450px;
    margin: 0 auto;
    padding: 2em;
    background-color: #1a1a1a;
    border-radius: 8px;
  }

  h2 {
    text-align: center;
    color: #ffd700;
    margin-bottom: 0.5em;
  }

  .description {
    text-align: center;
    color: #ccc;
    margin-bottom: 2em;
    font-size: 0.95em;
  }

  .form-group {
    margin-bottom: 1.5em;
    text-align: left;
  }

  label {
    display: block;
    margin-bottom: 0.5em;
    font-weight: bold;
  }

  input {
    width: 100%;
    padding: 0.75em;
    font-size: 1em;
  }

  .button-group {
    display: flex;
    flex-direction: column;
    gap: 0.5em;
    margin-top: 1.5em;
  }

  button {
    width: 100%;
  }

  .cancel-btn {
    background-color: #333;
    border-color: #333;
  }

  .cancel-btn:hover {
    background-color: #444;
  }


</style>
