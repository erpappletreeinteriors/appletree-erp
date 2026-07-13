import { useEffect, useState } from 'react';
import { AuthUser } from '@appletree/shared-types';
import { useAuth } from '../context/auth-context';
import { fetchCurrentUser } from '../api/users';

export function DashboardPage() {
  const { user, accessToken, signOut } = useAuth();
  const [profile, setProfile] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    fetchCurrentUser(accessToken)
      .then(setProfile)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load profile'));
  }, [accessToken]);

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <h1>Appletree Manufacturing ERP</h1>
        <button type="button" onClick={() => void signOut()}>
          Sign out
        </button>
      </header>

      <p>
        Signed in as <strong>{user?.fullName}</strong> ({user?.role})
      </p>

      {error && <p role="alert">{error}</p>}
      {profile && (
        <section>
          <h2>Profile (verified via GET /users/me)</h2>
          <dl>
            <dt>Email</dt>
            <dd>{profile.email}</dd>
            <dt>Role</dt>
            <dd>{profile.role}</dd>
          </dl>
        </section>
      )}
    </main>
  );
}
