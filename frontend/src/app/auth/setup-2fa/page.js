'use client';
import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Copy, CheckCircle2, AlertCircle, ArrowLeft, Smartphone } from 'lucide-react';

const SECRET_KEY = 'JBSWY3DPEHPK3PXP';
const QR_URL = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&color=58A6FF&bgcolor=0D1117&data=otpauth://totp/DevNexus%20AI:admin?secret=${SECRET_KEY}&issuer=DevNexus%20AI`;

export default function Setup2FAPage() {
  const router = useRouter();
  const [step, setStep] = useState(1); // 1=scan, 2=verify
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [enabling, setEnabling] = useState(false);
  const [success, setSuccess] = useState(false);
  const inputRefs = useRef([]);

  const copySecret = async () => {
    await navigator.clipboard.writeText(SECRET_KEY);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDigit = (index, value) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const newCode = [...code];
    newCode[index] = digit;
    setCode(newCode);
    setError('');
    if (digit && index < 5) inputRefs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleEnable = async () => {
    const fullCode = code.join('');
    if (fullCode.length < 6) {
      setError('Ingresa el código de verificación de 6 dígitos.');
      return;
    }
    setEnabling(true);
    await new Promise((r) => setTimeout(r, 1000));
    setEnabling(false);
    setSuccess(true);
    setTimeout(() => router.push('/hub'), 2000);
  };

  return (
    <div className="min-h-screen bg-[#0D1117] dot-grid flex items-center justify-center px-4">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[400px] h-[250px] bg-[#3FB950]/3 rounded-full blur-[80px]" />
      </div>

      <div className="relative w-full max-w-sm fade-in-up">
        <button
          data-testid="back-from-setup"
          onClick={() => step === 2 ? setStep(1) : router.back()}
          className="flex items-center gap-1.5 text-xs text-[#8B949E] hover:text-[#F0F6FC] transition-colors mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.5} />
          {step === 2 ? 'Volver al QR' : 'Volver'}
        </button>

        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#3FB950]/10 border border-[#3FB950]/20 mb-4">
            <Smartphone className="w-6 h-6 text-[#3FB950]" strokeWidth={1.5} />
          </div>
          <h1 className="font-mono text-lg font-bold text-[#F0F6FC] mb-1">Configurar 2FA</h1>
          <p className="text-xs text-[#8B949E]">Autenticación con app de autenticador</p>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center gap-2 mb-6">
          {[
            { n: 1, label: 'Escanear QR' },
            { n: 2, label: 'Verificar' },
          ].map((s, i) => (
            <div key={s.n} className="flex items-center gap-2 flex-1">
              <div className={`flex items-center gap-2 ${i > 0 ? 'flex-1' : ''}`}>
                {i > 0 && (
                  <div className={`h-px flex-1 transition-colors ${step >= s.n ? 'bg-[#3FB950]/50' : 'bg-[#21262D]'}`} />
                )}
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all flex-shrink-0 ${
                  step > s.n
                    ? 'bg-[#3FB950] text-white'
                    : step === s.n
                      ? 'bg-[#3FB950]/20 border border-[#3FB950]/50 text-[#3FB950]'
                      : 'bg-[#21262D] text-[#484F58]'
                }`}>
                  {step > s.n ? <CheckCircle2 className="w-3 h-3" strokeWidth={2} /> : s.n}
                </div>
                <span className={`text-[10px] font-medium transition-colors ${step >= s.n ? 'text-[#8B949E]' : 'text-[#484F58]'}`}>
                  {s.label}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-[#161B26] border border-[#21262D] rounded-2xl p-6">
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-xs text-[#8B949E] text-center leading-relaxed">
                Abre <strong className="text-[#F0F6FC]">Google Authenticator</strong> o <strong className="text-[#F0F6FC]">Authy</strong> y escanea el código QR para vincular tu cuenta.
              </p>

              {/* QR */}
              <div className="flex justify-center">
                <div className="bg-[#0D1117] border border-[#30363D] rounded-xl p-4 inline-block">
                  <img
                    src={QR_URL}
                    alt="QR Code para 2FA"
                    width={160}
                    height={160}
                    className="rounded"
                    style={{ imageRendering: 'pixelated' }}
                  />
                </div>
              </div>

              {/* Manual key */}
              <div>
                <p className="text-[9px] uppercase tracking-[0.12em] text-[#484F58] mb-1.5 font-semibold">Clave manual</p>
                <div className="flex items-center gap-2 bg-[#0D1117] border border-[#21262D] rounded-lg px-3 py-2">
                  <code className="flex-1 font-mono text-xs text-[#58A6FF] tracking-[0.2em] select-all">
                    {SECRET_KEY}
                  </code>
                  <button
                    data-testid="copy-secret"
                    onClick={copySecret}
                    className="text-[#484F58] hover:text-[#8B949E] transition-colors flex-shrink-0"
                    title="Copiar clave"
                  >
                    {copied
                      ? <CheckCircle2 className="w-3.5 h-3.5 text-[#3FB950]" strokeWidth={1.5} />
                      : <Copy className="w-3.5 h-3.5" strokeWidth={1.5} />
                    }
                  </button>
                </div>
              </div>

              <button
                data-testid="next-to-verify"
                onClick={() => setStep(2)}
                className="w-full bg-[#238636] hover:bg-[#2EA043] text-white font-semibold py-2.5 rounded-lg text-sm transition-all active:scale-[0.98]"
              >
                Continuar a verificación
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              {success ? (
                <div className="text-center py-4">
                  <div className="w-12 h-12 rounded-full bg-[#3FB950]/15 border border-[#3FB950]/30 flex items-center justify-center mx-auto mb-3">
                    <CheckCircle2 className="w-6 h-6 text-[#3FB950]" strokeWidth={1.5} />
                  </div>
                  <p className="font-mono font-bold text-[#3FB950] mb-1">2FA Activado</p>
                  <p className="text-xs text-[#8B949E]">Redirigiendo al dashboard...</p>
                </div>
              ) : (
                <>
                  <p className="text-xs text-[#8B949E] text-center">
                    Ingresa el código de 6 dígitos que muestra tu app de autenticación para confirmar la vinculación.
                  </p>

                  <div className="flex gap-2 justify-center">
                    {code.map((digit, i) => (
                      <input
                        key={i}
                        ref={(el) => (inputRefs.current[i] = el)}
                        data-testid={`setup-digit-${i}`}
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
                              ? 'border-[#3FB950]/50 focus:border-[#3FB950]'
                              : 'border-[#21262D] focus:border-[#3FB950]/50'
                        }`}
                      />
                    ))}
                  </div>

                  {error && (
                    <div
                      data-testid="setup-error"
                      className="flex items-center gap-2 bg-[#F778BA]/8 border border-[#F778BA]/20 rounded-lg px-3 py-2"
                    >
                      <AlertCircle className="w-3.5 h-3.5 text-[#F778BA] flex-shrink-0" strokeWidth={1.5} />
                      <p className="text-xs text-[#F778BA]">{error}</p>
                    </div>
                  )}

                  <button
                    data-testid="enable-2fa-btn"
                    onClick={handleEnable}
                    disabled={enabling || code.join('').length < 6}
                    className="w-full flex items-center justify-center gap-2 bg-[#238636] hover:bg-[#2EA043] disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg text-sm transition-all"
                  >
                    {enabling ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Activando...
                      </>
                    ) : (
                      <>
                        <Shield className="w-3.5 h-3.5" strokeWidth={2} />
                        Activar 2FA
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <div className="mt-4 bg-[#E3B341]/6 border border-[#E3B341]/15 rounded-xl p-3 text-center">
          <p className="text-[10px] text-[#E3B341]/80 font-mono">
            Demo — cualquier código de 6 dígitos es válido
          </p>
        </div>
      </div>
    </div>
  );
}
