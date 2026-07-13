import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from '../App';

describe('App', () => {
  it('redirects an unauthenticated visitor to the login page', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { name: /appletree manufacturing erp/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });
});
