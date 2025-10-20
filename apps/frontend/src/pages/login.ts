import {
  createDiv,
  createElement,
  createButton,
  createInput,
  createLabel,
  appendChildren,
} from "../utils/dom";
import { createIcon } from "../utils/icons";
import { appState } from "../utils/state";
import { navigate } from "../lib/router-instance";
import { setAuthTokens, getUserId } from "../lib/auth";

// Backend API URL
const API_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:3000' 
  : `https://${window.location.hostname}`;

export function createLoginPage(): HTMLElement {
  const container = createDiv("relative min-h-screen w-full overflow-hidden bg-[#030714]");

  const backgroundVideo = createElement(
    "video",
    "pointer-events-none absolute inset-0 h-full w-full object-cover"
  );
  backgroundVideo.muted = true;
  backgroundVideo.loop = true;
  backgroundVideo.autoplay = true;
  backgroundVideo.playsInline = true;
  backgroundVideo.setAttribute("muted", "");
  backgroundVideo.setAttribute("autoplay", "");
  backgroundVideo.setAttribute("loop", "");
  backgroundVideo.setAttribute("playsinline", "");
  backgroundVideo.setAttribute("aria-hidden", "true");
  backgroundVideo.src = "/bg.mp4";
  backgroundVideo.style.filter = "blur(32px) saturate(130%)";
  backgroundVideo.style.opacity = "0.65";

  const glowA = createDiv("pointer-events-none absolute -top-40 -left-32 h-96 w-96 rounded-full blur-3xl opacity-60");
  glowA.style.background = "radial-gradient(circle at center, rgba(0,200,255,0.35), transparent 60%)";
  const glowB = createDiv("pointer-events-none absolute -bottom-48 right-[-10%] h-[28rem] w-[28rem] rounded-full blur-3xl opacity-60");
  glowB.style.background = "radial-gradient(circle at center, rgba(255,0,140,0.3), transparent 65%)";
  const gridOverlay = createDiv("pointer-events-none absolute inset-0 opacity-30");
  gridOverlay.style.backgroundImage = "linear-gradient(90deg, rgba(0,200,255,0.08) 1px, transparent 1px), linear-gradient(180deg, rgba(0,200,255,0.08) 1px, transparent 1px)";
  gridOverlay.style.backgroundSize = "80px 80px";

  appendChildren(container, [backgroundVideo, glowA, glowB, gridOverlay]);

  const wrapper = createDiv("relative z-10 flex min-h-screen w-full items-center justify-center px-4 py-16");
  const card = createDiv(
    "w-full max-w-lg space-y-8 rounded-3xl border border-[#00C8FF]/25 bg-[#0a1124]/75 p-8 sm:p-10 shadow-[0_0_45px_rgba(0,200,255,0.25)] backdrop-blur-2xl"
  );
  // Local UI state for this card (re-render by clearing card.innerHTML and appending renderLoginForm)
  let mode: "login" | "register" = "login"; // which tab is active
  let isSubmitting = false;

  // Check if there's a pending OAuth 2FA challenge
  const oauth42Challenge = sessionStorage.getItem('oauth42Challenge');
  if (oauth42Challenge) {
    try {
      const challenge = JSON.parse(oauth42Challenge);
      sessionStorage.removeItem('oauth42Challenge');
      card.appendChild(render2FAForm(challenge.challengeId, challenge.challengeToken));
      wrapper.appendChild(card);
      container.appendChild(wrapper);
      return container;
    } catch (error) {
      console.error('Failed to parse OAuth challenge:', error);
    }
  }

  function renderLoginForm() {
    const content = createDiv("space-y-8");

    const header = createDiv("space-y-5 text-center");
    const logoWrap = createDiv("mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[#00C8FF]/30 bg-[#00C8FF]/10 shadow-[0_0_20px_rgba(0,200,255,0.25)]");
    logoWrap.appendChild(createIcon("gamepad", "h-6 w-6 text-[#00C8FF]"));
    const title = createElement("h1", "text-2xl font-semibold tracking-[0.35em] text-[#E0E0E0]/95 uppercase");
    title.textContent = mode === "login" ? "Welcome Back" : "Create Account";
    const subtitle = createElement("p", "text-sm text-[#E0E0E0]/60");
    subtitle.textContent = mode === "login"
      ? "Access the arena, manage your profile, and challenge friends."
      : "Join the ft_transcendence community and start competing.";
    const tabs = createDiv("inline-flex rounded-full border border-[#00C8FF]/20 bg-[#0d1529]/70 p-1");
    const loginTab = createButton(
      "Login",
      `px-4 py-2 rounded-full text-sm transition-colors ${
        mode === "login"
          ? "bg-[#00C8FF] text-[#0b1224] shadow-[0_0_15px_rgba(0,200,255,0.25)]"
          : "text-[#E0E0E0]/70 hover:text-[#00C8FF]"
      }`,
      () => {
        if (mode !== "login") {
          mode = "login";
          card.innerHTML = "";
          card.appendChild(renderLoginForm());
        }
      }
    );
    const registerTab = createButton(
      "Register",
      `px-4 py-2 rounded-full text-sm transition-colors ${
        mode === "register"
          ? "bg-[#00C8FF] text-[#0b1224] shadow-[0_0_15px_rgba(0,200,255,0.25)]"
          : "text-[#E0E0E0]/70 hover:text-[#00C8FF]"
      }`,
      () => {
        if (mode !== "register") {
          mode = "register";
          card.innerHTML = "";
          card.appendChild(renderLoginForm());
        }
      }
    );
    appendChildren(tabs, [loginTab, registerTab]);
    appendChildren(header, [logoWrap, title, subtitle, tabs]);

    const form = createDiv("space-y-5");

    let displayNameInput: HTMLInputElement | null = null;
    let displayNameError: HTMLElement | null = null;

    const emailGroup = createDiv("space-y-1");
    const emailLabel = createLabel("Email", "email", "text-[#E0E0E0]");
    const emailInput = createInput(
      "email",
      "w-full px-4 py-3 rounded-xl border border-[#00C8FF]/25 bg-[#091226]/80 text-[#E0E0E0] focus:border-[#00C8FF] focus:outline-none focus:ring-2 focus:ring-[#00C8FF]/40 transition",
      "you@example.com"
    );
    emailInput.id = "email";
    const emailError = createDiv("text-sm text-[#FF7AC3] min-h-[1rem]");

    const formGroups: HTMLElement[] = [];

    if (mode === "register") {
      const displayNameGroup = createDiv("space-y-1");
      const displayNameLabel = createLabel("Display Name", "displayName", "text-[#E0E0E0]");
      displayNameInput = createInput(
        "text",
        "w-full px-4 py-3 rounded-xl border border-[#00C8FF]/25 bg-[#091226]/80 text-[#E0E0E0] focus:border-[#00C8FF] focus:outline-none focus:ring-2 focus:ring-[#00C8FF]/40 transition",
        "Choose how others see you"
      );
      displayNameInput.id = "displayName";
      displayNameError = createDiv("text-sm text-[#FF7AC3] min-h-[1rem]");
      appendChildren(displayNameGroup, [displayNameLabel, displayNameInput, displayNameError]);
      formGroups.push(displayNameGroup);
    }

    appendChildren(emailGroup, [emailLabel, emailInput, emailError]);
    formGroups.push(emailGroup);
    formGroups.forEach((group) => form.appendChild(group));

    // Password with visibility toggle
    const passwordGroup = createDiv("space-y-1");
    const passwordLabel = createLabel("Password", "password", "text-[#E0E0E0]");
    // wrap the input in a relative container so we can place the icon inside
    const passRow = createDiv("");
    const passWrapper = createDiv("relative w-full");
    const passwordInput = createInput(
      "password",
      "w-full pr-12 pl-4 py-3 rounded-xl border border-[#00C8FF]/25 bg-[#091226]/80 text-[#E0E0E0] focus:border-[#00C8FF] focus:outline-none focus:ring-2 focus:ring-[#00C8FF]/40 transition",
      "Enter password"
    );
    passwordInput.id = "password";
    let passwordVisible = false;
    // icon button positioned inside the input (absolute)
    const toggleBtn = createButton(
      "",
      "absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-2 text-[#00C8FF] hover:bg-[#00C8FF]/10 transition"
    );
    toggleBtn.setAttribute("aria-label", "Show password");
    toggleBtn.title = "Show password";
    // create icons
    const eyeIcon = createIcon("eye", "h-5 w-5");
    const eyeOffIcon = createIcon("eyeOff", "h-5 w-5");
    // start with eye (show)
    toggleBtn.appendChild(eyeIcon);
    toggleBtn.addEventListener("click", () => {
      passwordVisible = !passwordVisible;
      passwordInput.type = passwordVisible ? "text" : "password";
      toggleBtn.setAttribute(
        "aria-label",
        passwordVisible ? "Hide password" : "Show password"
      );
      toggleBtn.title = passwordVisible ? "Hide password" : "Show password";
      // swap icons
      toggleBtn.innerHTML = "";
      toggleBtn.appendChild(passwordVisible ? eyeOffIcon : eyeIcon);
    });
    appendChildren(passWrapper, [passwordInput, toggleBtn]);
    appendChildren(passRow, [passWrapper]);
    const passwordError = createDiv("text-sm text-[#FF7AC3] min-h-[1rem]");
    appendChildren(passwordGroup, [passwordLabel, passRow, passwordError]);

    appendChildren(form, [passwordGroup]);

    const primaryBtn = createButton(
      mode === "login" ? "SIGN IN" : "CREATE ACCOUNT",
      "w-full rounded-xl bg-[#00C8FF] px-5 py-3 text-sm font-semibold uppercase tracking-[0.3em] text-[#060B1A] shadow-[0_0_24px_rgba(0,200,255,0.25)] transition hover:bg-[#00C8FF]/90 focus:outline-none focus:ring-2 focus:ring-[#00C8FF]/60",
      () => {
        if (isSubmitting) return;

        // clear previous visuals
        emailError.textContent = "";
        if (displayNameError) displayNameError.textContent = "";
        passwordError.textContent = "";
        emailInput.style.borderColor = "";
        passwordInput.style.borderColor = "";
        if (displayNameInput) displayNameInput.style.borderColor = "";

        // basic validation
        let ok = true;
        const emailVal = emailInput.value.trim();
        const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailVal || !emailRe.test(emailVal)) {
          emailError.textContent = "Please enter a valid email.";
          emailInput.style.borderColor = "#f87171";
          ok = false;
        }
        if (!passwordInput.value || passwordInput.value.length < 8) {
          passwordError.textContent = "Password must be at least 8 characters.";
          passwordInput.style.borderColor = "#f87171";
          ok = false;
        }
        const displayNameVal = (displayNameInput?.value || "").trim();
        if (mode === "register") {
          if (!displayNameVal || displayNameVal.length < 3) {
            if (displayNameError) {
              displayNameError.textContent = "Display name must be at least 3 characters.";
            }
            if (displayNameInput) {
              displayNameInput.style.borderColor = "#f87171";
            }
            ok = false;
          }
        }

        if (!ok) return;

        // Submit to backend
        isSubmitting = true;
        primaryBtn.setAttribute("disabled", "true");
        primaryBtn.textContent =
          mode === "login" ? "Logging In..." : "Registering...";

        const apiCall = mode === "login"
          ? fetch(`${API_URL}/auth/login`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                email: emailVal,
                password: passwordInput.value,
              }),
            })
          : fetch(`${API_URL}/auth/register`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                email: emailVal,
                password: passwordInput.value,
                displayName: displayNameVal,
              }),
            });

        apiCall
          .then(async (res) => {
            if (!res.ok) {
              const errorPayload = await res.json().catch(() => null);
              const serverMessage =
                (errorPayload && (errorPayload.message as string | undefined)) ||
                (errorPayload && typeof errorPayload.error === "string" ? errorPayload.error : undefined) ||
                (errorPayload && typeof errorPayload.error === "object"
                  ? (errorPayload.error?.message as string | undefined)
                  : undefined) ||
                res.statusText ||
                `HTTP ${res.status}`;
              console.warn("Auth request failed", {
                status: res.status,
                message: serverMessage,
              });
              throw new Error(serverMessage);
            }
            return res.json();
          })
          .then((data) => {
            isSubmitting = false;
            primaryBtn.removeAttribute("disabled");
            primaryBtn.textContent = mode === "login" ? "SIGN IN" : "CREATE ACCOUNT";

            if (mode === "login") {
              // Check if 2FA challenge is required (202 response)
              if (data.type === "challenge" && data.challengeId) {
                // Store challenge info and show 2FA form
                card.innerHTML = "";
                card.appendChild(render2FAForm(data.challengeId, data.challengeToken));
              } else if (data.accessToken) {
                // Direct login success - store tokens
                setAuthTokens(data.accessToken, data.refreshToken);
                const userId = getUserId();
                appState.setState({
                  isLoggedIn: true,
                  userId: userId || undefined,
                });
                void navigate('/home', { replace: true });
              }
            } else {
              // Registration success - switch to login mode after brief success message
              primaryBtn.textContent = "✓ ACCOUNT CREATED!";
              primaryBtn.className = "w-full rounded-xl bg-gradient-to-r from-[#4ADE80] to-[#22D3EE] px-5 py-3 text-sm font-semibold text-[#052112] shadow-[0_0_24px_rgba(34,211,238,0.3)] transition";
              
              setTimeout(() => {
                mode = "login";
                card.innerHTML = "";
                card.appendChild(renderLoginForm());
              }, 1500);
            }
          })
          .catch((err) => {
            isSubmitting = false;
            primaryBtn.removeAttribute("disabled");
            primaryBtn.textContent = mode === "login" ? "SIGN IN" : "CREATE ACCOUNT";
            
            // Display error message
            const errorMsg = err.message || "An error occurred";
            if (mode === "login") {
              passwordError.textContent = errorMsg;
              passwordInput.style.borderColor = "#f87171";
            } else {
              emailError.textContent = errorMsg;
              emailInput.style.borderColor = "#f87171";
              if (displayNameError) {
                displayNameError.textContent = errorMsg;
              }
              if (displayNameInput) {
                displayNameInput.style.borderColor = "#f87171";
              }
            }
          });
      }
    );
    appendChildren(form, [primaryBtn]);

    const divider = createDiv("relative");
    const dividerLine = createDiv("absolute inset-0 flex items-center");
    const dividerBorder = createDiv("w-full border-t border-[#00C8FF]/20");
    dividerLine.appendChild(dividerBorder);
    const dividerText = createDiv("relative flex justify-center");
    const dividerSpan = createElement(
      "span",
      "bg-[#0a1124]/90 px-4 text-xs uppercase tracking-[0.4em] text-[#E0E0E0]/50"
    );
    dividerSpan.textContent = "or";
    dividerText.appendChild(dividerSpan);
    appendChildren(divider, [dividerLine, dividerText]);

    const signIn42Btn = createButton(
      "Continue with 42",
      "w-full rounded-xl border border-[#00C8FF]/30 bg-[#091226]/70 px-5 py-3 text-sm font-semibold text-[#00C8FF] hover:border-[#00C8FF]/60 hover:text-[#E0E0E0] hover:bg-[#00C8FF]/15 transition-colors inline-flex items-center justify-center gap-3"
    );
    signIn42Btn.addEventListener("click", () => {
      // Redirect to backend OAuth start endpoint
      // The backend will redirect to 42 OAuth, then handle callback
      window.location.href = `${API_URL}/auth/42/start`;
    });
    
    const svg42 = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg42.setAttribute("class", "h-5 w-5");
    svg42.setAttribute("viewBox", "0 0 24 24");
    svg42.setAttribute("fill", "currentColor");
    const path42 = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "path"
    );
    path42.setAttribute(
      "d",
      "M24 12.42L12.42 24V18.9l5.1-5.1L12.42 8.7V3.6L24 15.18v-2.76zM8.7 18.9v5.1L0 15.18v-2.76L8.7 3.6v5.1l-5.1 5.1 5.1 5.1z"
    );
    svg42.appendChild(path42);
    signIn42Btn.insertBefore(svg42, signIn42Btn.firstChild);

    appendChildren(content, [header, form, divider, signIn42Btn]);
    return content;
  }

  function render2FAForm(challengeId?: string, challengeToken?: string) {
    const content = createDiv("space-y-8");

    const header = createDiv("space-y-4 text-center");
    const iconAura = createDiv("mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-[#00C8FF]/30 bg-[#00C8FF]/10 shadow-[0_0_25px_rgba(0,200,255,0.25)]");
    iconAura.appendChild(createIcon("shield", "h-7 w-7 text-[#00C8FF]"));
    const title = createElement("h2", "text-xl font-semibold text-[#E0E0E0]");
    title.textContent = "Two-Factor Verification";
    const subtitle = createElement("p", "text-sm text-[#E0E0E0]/60");
    subtitle.textContent = "Enter the 6-digit code from your authenticator app.";
    appendChildren(header, [iconAura, title, subtitle]);

    const otpWrapper = createDiv("flex flex-wrap justify-center gap-3");
    const otpInputs: HTMLInputElement[] = [];
    for (let i = 0; i < 6; i++) {
      const input = createInput(
        "text",
        "w-12 h-12 rounded-xl border border-[#00C8FF]/30 bg-[#091226]/70 text-center text-lg font-semibold text-[#E0E0E0] focus:border-[#00C8FF] focus:outline-none focus:ring-2 focus:ring-[#00C8FF]/40",
      );
      input.maxLength = 1;
      input.inputMode = 'numeric';
      input.addEventListener("input", (event) => {
        const target = event.target as HTMLInputElement;
        if (/[^0-9]/.test(target.value)) {
          target.value = target.value.replace(/[^0-9]/g, "");
        }
        if (target.value && i < 5) {
          otpInputs[i + 1].focus();
        }
      });
      input.addEventListener("keydown", (event) => {
        if (event.key === "Backspace" && !input.value && i > 0) {
          otpInputs[i - 1].focus();
        }
      });
      otpInputs.push(input);
      otpWrapper.appendChild(input);
    }

    const errorDiv = createDiv("text-sm text-[#FF7AC3] text-center min-h-[1.25rem]");

    const verifyBtn = createButton(
      "VERIFY & CONTINUE",
      "w-full rounded-xl bg-[#00C8FF] px-5 py-3 text-sm font-semibold uppercase tracking-[0.3em] text-[#060B1A] shadow-[0_0_24px_rgba(0,200,255,0.25)] transition hover:bg-[#00C8FF]/90 focus:outline-none focus:ring-2 focus:ring-[#00C8FF]/60",
      () => {
        const code = otpInputs.map((input) => input.value).join("");
        if (code.length !== 6) {
          errorDiv.textContent = "Please enter all 6 digits";
          return;
        }
        if (!challengeId || !challengeToken) {
          errorDiv.textContent = "Invalid 2FA session";
          return;
        }

        errorDiv.textContent = "";
        verifyBtn.setAttribute("disabled", "true");
        verifyBtn.textContent = "Verifying...";

        fetch(`${API_URL}/auth/login/challenge`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            challengeId,
            challengeToken,
            code,
            rememberDevice: false,
          }),
        })
          .then(async (res) => {
            if (!res.ok) {
              const errorPayload = await res.json().catch(() => null);
              const serverMessage =
                (errorPayload && (errorPayload.message as string | undefined)) ||
                (errorPayload && typeof errorPayload.error === "string" ? errorPayload.error : undefined) ||
                (errorPayload && typeof errorPayload.error === "object"
                  ? (errorPayload.error?.message as string | undefined)
                  : undefined) ||
                res.statusText ||
                `HTTP ${res.status}`;
              console.warn("2FA verification failed", {
                status: res.status,
                message: serverMessage,
              });
              throw new Error(serverMessage);
            }
            return res.json();
          })
          .then((data) => {
            if (data.accessToken) {
              setAuthTokens(data.accessToken, data.refreshToken);
              const userId = getUserId();
              appState.setState({ isLoggedIn: true, userId: userId || undefined });
              void navigate('/home', { replace: true });
            } else {
              throw new Error("No access token received");
            }
          })
          .catch((err) => {
            verifyBtn.removeAttribute("disabled");
            verifyBtn.textContent = "Verify & Continue";
            errorDiv.textContent = err.message || "Verification failed";
            otpInputs.forEach((input) => (input.value = ""));
            otpInputs[0].focus();
          });
      },
    );

    const backBtn = createButton(
      "Back to Login",
      "w-full rounded-xl border border-transparent px-5 py-3 text-sm font-medium text-[#E0E0E0]/60 hover:text-[#00C8FF] hover:border-[#00C8FF]/30 transition",
      () => {
        card.innerHTML = "";
        card.appendChild(renderLoginForm());
      },
    );

    appendChildren(content, [header, otpWrapper, errorDiv, verifyBtn, backBtn]);
    return content;
  }

  card.appendChild(renderLoginForm());
  wrapper.appendChild(card);
  container.appendChild(wrapper);
  return container;
}
