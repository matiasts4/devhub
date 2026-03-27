'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Smartphone, Mail, ArrowLeft, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export default function Verify2FAPage() {
  const router = useRouter();
  const { user, verifyMfa, loading } = useAuth();
  const [method, setMethod] = useState('totp'); // 'totp' | 'email'
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const inputRefs = useRef([]);

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  const handleDigit = (index, value) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const newCode = [...code];
    newCode[index] = digit;
    setCode(newCode);
    setError('');
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      setCode(pasted.split(''));
      inputRefs.current[5]?.focus();
    }
  };

  const handleVerify = async () => {
    const fullCode = code.join('');
    if (fullCode.length < 6) {
      setError('Ingresa el código de 6 dígitos completo.');
      return;
    }
    setVerifying(true);
    await new Promise((r) => setTimeout(r, 800));
    // Mock: any 6-digit code is valid
    verifyMfa();
    setVerifying(false);
    router.push('/hub');
  };

  const sendEmailCode = async () => {
    setEmailSent(true);
    await new Promise((r) => setTimeout(r, 1000));
  };

  if (loading || !user) return null;

  return (
    <div className="min-h-screen bg-[#0D1117] dot-grid flex items-center justify-center px-4">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[400px] h-[250px] bg-[#D2A8FF]/4 rounded-full blur-[80px]" />
      </div>

      <div className="relative w-full max-w-sm fade-in-up">
        {/* Back */}
        <button
          data-testid="back-to-login"
          onClick={() => router.push('/login')}
          className="flex items-center gap-1.5 text-xs text-[#8B949E] hover:text-[#F0F6FC] transition-colors mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.5} />
          Volver al inicio de sesión
        </button>

        {/* Brand */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#D2A8FF]/10 border border-[#D2A8FF]/20 mb-4">
            <Shield className="w-6 h-6 text-[#D2A8FF]" strokeWidth={1.5} />
          </div>
          <h1 className="font-mono text-lg font-bold text-[#F0F6FC] mb-1">Verificación 2FA</h1>
          <p className="text-xs text-[#8B949E]">
            Sesión iniciada como <span className="text-[#F0F6FC] font-medium">{user.email}</span>
          </p>
        </div>

        <div className="bg-[#161B26] border border-[#21262D] rounded-2xl p-6">
          {/* Method toggle */}
          <div className="flex rounded-lg overflow-hidden border border-[#21262D] mb-5">
            <button
              data-testid="method-totp"
              onClick={() => { setMethod('totp'); setCode(['', '', '', '', '', '']); setError(''); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-all ${
                method === 'totp'
                  ? 'bg-[#21262D] text-[#F0F6FC]'
                  : 'text-[#8B949E] hover:text-[#F0F6FC]'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" strokeWidth={1.5} />
              Autenticador
            </button>
            <button
              data-testid="method-email"
              onClick={() => { setMethod('email'); setCode(['', '', '', '', '', '']); setError(''); setEmailSent(false); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-all ${
                method === 'email'
                  ? 'bg-[#21262D] text-[#F0F6FC]'
                  : 'text-[#8B949E] hover:text-[#F0F6FC]'
              }`}
            >
              <Mail className="w-3.5 h-3.5" strokeWidth={1.5} />
              Email
            </button>
          </div>

          {/* Instructions */}
          <p className="text-xs text-[#8B949E] text-center mb-5">
            {method === 'totp'
              ? 'Abre tu app de autenticación (Google Authenticator / Authy) e ingresa el código de 6 dígitos.'
              : emailSent
                ? `Revisá tu correo ${user.email} e ingresa el código que te enviamos.`
                : 'Te enviaremos un código de 6 dígitos a tu correo electrónico.'
            }
          </p>

          {/* Email send button */}
          {method === 'email' && !emailSent && (
            <button
              data-testid="send-email-code"
              onClick={sendEmailCode}
              className="w-full flex items-center justify-center gap-2 bg-[#21262D] hover:bg-[#30363D] border border-[#30363D] text-[#F0F6FC] py-2.5 rounded-lg text-xs font-medium transition-all mb-4"
            >
              <Mail className="w-3.5 h-3.5" strokeWidth={1.5} />
              Enviar código por email
            </button>
          )}

          {method === 'email' && emailSent && (
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-1.5 text-xs text-[#3FB950]">
                <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                <span>Código enviado</span>
              </div>
              <button
                data-testid="resend-code"
                onClick={sendEmailCode}
                className="flex items-center gap-1 text-[10px] text-[#58A6FF] hover:text-[#79B8FF] transition-colors"
              >
                <RefreshCw className="w-3 h-3" strokeWidth={1.5} />
                Reenviar
              </button>
            </div>
          )}

          {/* OTP Input */}
          {(method === 'totp' || emailSent) && (
            <div className="flex gap-2 justify-center mb-4" onPaste={handlePaste}>
              {code.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => (inputRefs.current[i] = el)}
                  data-testid={`otp-digit-${i}`}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleDigit(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  className={`w-10 h-12 text-center font-mono text-lg font-bold bg-[#0D1117] border rounded-lg text-[#F0F6FC] focus:outline-none transition-all ${
                    error
                      ? 'border-[#F778BA]/50 focus:border-[#F778BA]'
                      : digit
                        ? 'border-[#58A6FF]/50 focus:border-[#58A6FF]'
                        : 'border-[#21262D] focus:border-[#388BFD]/50'
                  }`}
                />
              ))}
            </div>
          )}

          {/* Error */}
          {error && (
            <div
              data-testid="verify-error"
              className="flex items-center gap-2 bg-[#F778BA]/8 border border-[#F778BA]/20 rounded-lg px-3 py-2 mb-4"
            >
              <AlertCircle className="w-3.5 h-3.5 text-[#F778BA] flex-shrink-0" strokeWidth={1.5} />
              <p className="text-xs text-[#F778BA]">{error}</p>
            </div>
          )}

          {/* Verify button */}
          {(method === 'totp' || emailSent) && (
            <button
              data-testid="verify-submit"
              onClick={handleVerify}
              disabled={verifying || code.join('').length < 6}
              className="w-full flex items-center justify-center gap-2 bg-[#238636] hover:bg-[#2EA043] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg text-sm transition-all active:scale-[0.98]"
            >
              {verifying ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Verificando...</span>
                </>
              ) : (
                <>
                  <Shield className="w-3.5 h-3.5" strokeWidth={2} />
                  <span>Verificar código</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Demo hint */}
        <div className="mt-4 bg-[#E3B341]/6 border border-[#E3B341]/15 rounded-xl p-3 text-center">
          <p className="text-[10px] text-[#E3B341]/80 font-mono">
            Demo — cualquier código de 6 dígitos es válido
          </p>
        </div>
      </div>
    </div>
  );
}
