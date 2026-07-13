import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Role } from '@appletree/shared-types';
import { AuthProvider } from '../context/AuthContext';
import { LoginPage } from '../pages/LoginPage';

function renderLoginPage() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('LoginPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('submits credentials and stores the returned refresh token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        accessToken: 'access-123',
        refreshToken: 'refresh-456',
        user: {
          id: 'u1',
          email: 'cutting.master@appletreeinteriors.local',
          fullName: 'Cutting Master',
          role: Role.CUTTING_MASTER,
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderLoginPage();

    await userEvent.type(
      screen.getByLabelText(/email/i),
      'cutting.master@appletreeinteriors.local',
    );
    await userEvent.type(screen.getByLabelText(/password/i), 'correct-password');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(localStorage.getItem('appletree.auth.refreshToken')).toBe('refresh-456');
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/auth/login'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('shows an error message when the credentials are rejected', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ message: 'Invalid credentials' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderLoginPage();

    await userEvent.type(
      screen.getByLabelText(/email/i),
      'cutting.master@appletreeinteriors.local',
    );
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid credentials');
  });
});
