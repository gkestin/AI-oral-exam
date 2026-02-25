'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { resendVerificationEmail, refreshAuthToken } from '@/lib/firebase';
import { useAuth } from '@/lib/hooks';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from '@/components/ui';
import type { UserApiKeyStatus, UserKeyPolicy } from '@/types';

export default function SettingsPage() {
  const [policy, setPolicy] = useState<UserKeyPolicy | null>(null);
  const [status, setStatus] = useState<UserApiKeyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [openaiKey, setOpenaiKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [googleKey, setGoogleKey] = useState('');
  const [elevenlabsKey, setElevenlabsKey] = useState('');
  const [useHarvardKeys, setUseHarvardKeys] = useState(true);
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null);
  const { user: firebaseUser } = useAuth();

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      await refreshAuthToken();
      const [policyData, statusData] = await Promise.all([
        api.users.getKeyPolicy(),
        api.users.getApiKeys(),
      ]);
      setPolicy(policyData);
      setStatus(statusData);
      setUseHarvardKeys(policyData.useHarvardKeys);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const saveKeys = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await api.users.updateApiKeys({
        openaiKey: openaiKey || undefined,
        anthropicKey: anthropicKey || undefined,
        googleKey: googleKey || undefined,
        elevenlabsKey: elevenlabsKey || undefined,
      });
      setMessage('API keys saved.');
      setOpenaiKey('');
      setAnthropicKey('');
      setGoogleKey('');
      setElevenlabsKey('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Failed to save API keys');
    } finally {
      setSaving(false);
    }
  };

  const savePreference = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await api.users.setSharedKeyPreference(useHarvardKeys);
      setMessage('Shared key preference updated.');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Failed to update preference');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">API Key Settings</h1>
        <p className="text-slate-600">
          Choose Harvard shared keys or your own provider keys.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 border border-red-200 rounded-lg p-3 text-sm">
          {error}
        </div>
      )}
      {message && (
        <div className="bg-green-50 text-green-700 border border-green-200 rounded-lg p-3 text-sm">
          {message}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Eligibility</CardTitle>
          <CardDescription>Harvard accounts get unlimited shared-key usage.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Harvard eligible: <strong>{policy?.isHarvardEligible ? 'Yes' : 'No'}</strong>
          </p>
          <p>
            Email verified: <strong>{policy?.emailVerified ? 'Yes' : 'No'}</strong>
          </p>
          {policy?.isHarvardEligible && !policy?.emailVerified && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
              <p className="text-amber-800">
                Verify your email to unlock unlimited Harvard shared-key access.
                A verification email was sent when you signed up — check your inbox and spam folder.
              </p>
              <p className="text-amber-700 text-xs">
                After clicking the link in the email, refresh this page to update your status.
              </p>
              {verificationMessage && (
                <p className={`text-xs ${verificationMessage.startsWith('Verification email sent') ? 'text-green-700' : 'text-red-600'}`}>
                  {verificationMessage}
                </p>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  setVerificationMessage(null);
                  try {
                    await resendVerificationEmail();
                    setVerificationMessage('Verification email sent! Check your inbox, then sign out and back in.');
                  } catch (err: any) {
                    let msg: string;
                    if (err?.message === 'Email already verified') {
                      msg = 'Your email is already verified! Refreshing your status now...';
                      await load();
                    } else if (err?.code === 'auth/too-many-requests') {
                      msg = 'A verification email was already sent recently. Please check your inbox (and spam folder) and wait a few minutes before trying again.';
                    } else {
                      msg = err.message || 'Failed to send verification email.';
                    }
                    setVerificationMessage(msg);
                  }
                }}
              >
                Resend Verification Email
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Shared Key Preference</CardTitle>
          <CardDescription>
            If enabled, your account can use Harvard shared keys (subject to policy).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={useHarvardKeys}
              onChange={(e) => setUseHarvardKeys(e.target.checked)}
              disabled={saving}
            />
            Use Harvard shared keys when available
          </label>
          <Button onClick={savePreference} disabled={saving}>
            Save Preference
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your Provider Keys</CardTitle>
          <CardDescription>
            Add one or more model-provider keys. The app uses your own keys first.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="openai">OpenAI</Label>
            <Input
              id="openai"
              type="password"
              placeholder={status?.openaiConfigured ? 'Configured (enter new key to replace)' : 'sk-...'}
              value={openaiKey}
              onChange={(e) => setOpenaiKey(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="anthropic">Anthropic</Label>
            <Input
              id="anthropic"
              type="password"
              placeholder={status?.anthropicConfigured ? 'Configured (enter new key to replace)' : 'sk-ant-...'}
              value={anthropicKey}
              onChange={(e) => setAnthropicKey(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="google">Google/Gemini</Label>
            <Input
              id="google"
              type="password"
              placeholder={status?.googleConfigured ? 'Configured (enter new key to replace)' : 'AIza...'}
              value={googleKey}
              onChange={(e) => setGoogleKey(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="elevenlabs">ElevenLabs (optional)</Label>
            <Input
              id="elevenlabs"
              type="password"
              placeholder={status?.elevenlabsConfigured ? 'Configured (enter new key to replace)' : '...'}
              value={elevenlabsKey}
              onChange={(e) => setElevenlabsKey(e.target.value)}
            />
          </div>
          <Button onClick={saveKeys} disabled={saving}>
            Save Keys
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
