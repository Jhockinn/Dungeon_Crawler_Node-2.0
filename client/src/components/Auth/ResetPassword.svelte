<script>
  import { onMount } from 'svelte';
  import { resetPassword } from '../../services/authService';
  import toast from 'svelte-french-toast';

  let token = '';
  let newPassword = '';
  let confirmPassword = '';
  let loading = false;
  let success = false;
  let tokenError = '';

  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    token = params.get('token') || '';

    if (!token) {
      tokenError = 'No reset token provided. Please request a new password reset link.';
    }
  });

  async function handleSubmit() {
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    loading = true;

    try {
      await resetPassword(token, newPassword);
      success = true;

      setTimeout(() => {
        window.location.href = '/';
      }, 3000);
    } catch (err) {
      toast.error(err.message);
    } finally {
      loading = false;
    }
  }
</script>

<div class="reset-password">
  <div class="reset-card">
    <h2>🔐 Reset Password</h2>
    
    {#if success}
      <div class="success-box">
        <div class="icon">✅</div>
        <h3>Password Reset Successful!</h3>
        <p>Your password has been reset successfully.</p>
        <p>Redirecting to login...</p>
      </div>
    {:else if !token || tokenError}
      <div class="error-box">
        <div class="icon">❌</div>
        <p>{tokenError || 'Invalid reset link'}</p>
        <a href="/">Go to Login</a>
      </div>
    {:else}
      <p class="description">Enter your new password below.</p>

      <form on:submit|preventDefault={handleSubmit}>
        <div class="form-group">
          <label for="newPassword">New Password:</label>
          <input 
            type="password" 
            id="newPassword" 
            bind:value={newPassword} 
            required 
            disabled={loading}
            placeholder="Enter new password"
            minlength="6"
          />
        </div>

        <div class="form-group">
          <label for="confirmPassword">Confirm Password:</label>
          <input 
            type="password" 
            id="confirmPassword" 
            bind:value={confirmPassword} 
            required 
            disabled={loading}
            placeholder="Confirm new password"
            minlength="6"
          />
        </div>

        <button type="submit" disabled={loading}>
          {loading ? 'Resetting...' : 'Reset Password'}
        </button>
      </form>
    {/if}
  </div>
</div>

<style>
  .reset-password {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2em;
  }

  .reset-card {
    max-width: 500px;
    width: 100%;
    padding: 3em;
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

  button {
    width: 100%;
    margin-top: 1em;
  }

  .success-box, .error-box {
    padding: 2em 0;
    text-align: center;
  }

  .icon {
    font-size: 4em;
    margin-bottom: 0.5em;
  }

  h3 {
    color: #ffd700;
    margin-bottom: 1em;
  }

  p {
    margin: 0.5em 0;
    color: #ccc;
  }

  .error-box p {
    color: #ff4444;
  }

  a {
    display: inline-block;
    margin-top: 1.5em;
    padding: 0.75em 2em;
    background-color: #646cff;
    color: white;
    text-decoration: none;
    border-radius: 4px;
  }

  a:hover {
    background-color: #5555dd;
  }
</style>
