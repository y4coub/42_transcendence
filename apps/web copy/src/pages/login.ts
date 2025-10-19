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
import { setAuthTokens, getUserId } from "../lib/auth";

// Backend API URL
const API_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:3000' 
  : `https://${window.location.hostname}`;

export function createLoginPage(): HTMLElement {
  const container = createDiv(
    "relative z-10 min-h-screen w-full flex items-center justify-center p-4 bg-[rgba(233,0,0,0.4)]"
  );

  const videoWrapper = document.createElement("div");
  videoWrapper.style.position = "fixed";
  videoWrapper.style.inset = "0";
  videoWrapper.style.zIndex = "0";
  videoWrapper.style.overflow = "hidden";
  videoWrapper.style.willChange = "transform";

  // Video (no expensive filters on the element itself)
  const bgVideo = document.createElement("video");
  bgVideo.src = "/bg.mp4";
  bgVideo.autoplay = true;
  bgVideo.muted = true;
  bgVideo.loop = true;
  bgVideo.playsInline = true;
  bgVideo.style.position = "absolute";
  bgVideo.style.top = "50%";
  bgVideo.style.left = "50%";
  bgVideo.style.minWidth = "100%";
  bgVideo.style.minHeight = "100%";
  bgVideo.style.objectFit = "cover";
  bgVideo.preload = "auto";
  bgVideo.style.willChange = "transform";
  bgVideo.style.backfaceVisibility = "hidden";
  bgVideo.style.transform = "translate3d(-50%, -50%, 0)";
  bgVideo.setAttribute("aria-hidden", "true");
  bgVideo.style.pointerEvents = "none";
  videoWrapper.appendChild(bgVideo);

  // Overlay with backdrop-filter so the video appears blurred
  const overlay = document.createElement("div");
  overlay.style.position = "absolute";
  overlay.style.inset = "0";
  overlay.style.background =
    "linear-gradient(120deg, rgba(0, 225, 255, 0.25), rgba(245, 5, 145, 0.22))";
  overlay.style.zIndex = "2";
  overlay.style.pointerEvents = "none";
  overlay.style.backdropFilter = "blur(30px) brightness(0.6)";
  (overlay.style as any).webkitBackdropFilter = "blur(6px) brightness(0.6)";
  videoWrapper.appendChild(overlay);

  container.appendChild(videoWrapper);

  const wrapper = createDiv("w-full max-w-md");
  const card = createDiv(
    "border border-[#00C8FF] bg-[#1a1a24] p-8 rounded shadow-[0_0_15px_rgba(0,200,255,0.3)]"
  );
  card.style.position = "relative";
  card.style.zIndex = "10";
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
    const content = createDiv("space-y-6");

    const header = createDiv("space-y-2");
    const titleRow = createDiv("flex items-center justify-between");
    const title = createElement("h1", "text-[#00C8FF]");
    title.textContent = "DEN-DEN";
    // simple tab toggles
    const tabs = createDiv("inline-flex rounded bg-[#121217]/50 p-1");
    const loginTab = createButton(
      "Login",
      `px-3 py-1 rounded ${
        mode === "login"
          ? "bg-[#00C8FF] text-[#121217]"
          : "text-[#E0E0E0]/60 hover:bg-[#00C8FF]/10"
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
      `px-3 py-1 rounded ${
        mode === "register"
          ? "bg-[#00C8FF] text-[#121217]"
          : "text-[#E0E0E0]/60 hover:bg-[#00C8FF]/10"
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
    const subtitle = createElement("p", "text-[#E0E0E0]/60");
    subtitle.textContent = "Enter the Arena";
    appendChildren(titleRow, [title, tabs]);
    appendChildren(header, [titleRow, subtitle]);

    const form = createDiv("space-y-4");

    // Username
    const usernameGroup = createDiv("space-y-1");
    const usernameLabel = createLabel("Username", "username", "text-[#E0E0E0]");
    const usernameInput = createInput(
      "text",
      "w-full px-3 py-2 rounded border border-[#00C8FF]/50 bg-[#121217] text-[#E0E0E0] focus:border-[#00C8FF] focus:outline-none focus:ring-2 focus:ring-[#00C8FF]/50",
      "Enter username"
    );
    usernameInput.id = "username";
    const usernameError = createDiv("text-sm text-red-400 min-h-[1rem]");
    appendChildren(usernameGroup, [
      usernameLabel,
      usernameInput,
      usernameError,
    ]);

    // If register mode, add email
    let emailInput: HTMLInputElement | null = null;
    let emailError: HTMLElement | null = null;
    if (mode === "register") {
      const emailGroup = createDiv("space-y-1");
      const emailLabel = createLabel("Email", "email", "text-[#E0E0E0]");
      emailInput = createInput(
        "email",
        "w-full px-3 py-2 rounded border border-[#00C8FF]/50 bg-[#121217] text-[#E0E0E0] focus:border-[#00C8FF] focus:outline-none focus:ring-2 focus:ring-[#00C8FF]/50",
        "you@domain.com"
      );
      emailInput.id = "email";
      emailError = createDiv("text-sm text-red-400 min-h-[1rem]");
      appendChildren(emailGroup, [emailLabel, emailInput, emailError]);
      appendChildren(form, [usernameGroup, emailGroup]);
    } else {
      appendChildren(form, [usernameGroup]);
    }

    // Password with visibility toggle
    const passwordGroup = createDiv("space-y-1");
    const passwordLabel = createLabel("Password", "password", "text-[#E0E0E0]");
    // wrap the input in a relative container so we can place the icon inside
    const passRow = createDiv("");
    const passWrapper = createDiv("relative w-full");
    const passwordInput = createInput(
      "password",
      "w-full pr-10 px-3 py-2 rounded border border-[#00C8FF]/50 bg-[#121217] text-[#E0E0E0] focus:border-[#00C8FF] focus:outline-none focus:ring-2 focus:ring-[#00C8FF]/50",
      "Enter password"
    );
    passwordInput.id = "password";
    let passwordVisible = false;
    // icon button positioned inside the input (absolute)
    const toggleBtn = createButton(
      "",
      "absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-[#00C8FF] hover:bg-[#00C8FF]/10 inline-flex items-center justify-center"
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
    const passwordError = createDiv("text-sm text-red-400 min-h-[1rem]");
    appendChildren(passwordGroup, [passwordLabel, passRow, passwordError]);

    appendChildren(form, [passwordGroup]);

    const primaryBtn = createButton(
      mode === "login" ? "Sign In" : "Create Account",
      "w-full bg-[#00C8FF] text-[#121217] hover:bg-[#00C8FF]/90 shadow-[0_0_10px_rgba(0,200,255,0.5)] px-4 py-2 rounded transition-colors",
      () => {
        if (isSubmitting) return;

        // clear previous visuals
        usernameError.textContent = "";
        passwordError.textContent = "";
        if (emailError) emailError.textContent = "";
        usernameInput.style.borderColor = "";
        passwordInput.style.borderColor = "";
        if (emailInput) emailInput.style.borderColor = "";

        // basic validation
        let ok = true;
        if (!usernameInput.value || usernameInput.value.trim().length < 3) {
          usernameError.textContent = "Please enter a username (min 3 chars).";
          usernameInput.style.borderColor = "#f87171";
          ok = false;
        }
        if (!passwordInput.value || passwordInput.value.length < 8) {
          passwordError.textContent = "Password must be at least 8 characters.";
          passwordInput.style.borderColor = "#f87171";
          ok = false;
        }
        if (mode === "register" && emailInput) {
          const emailVal = (emailInput.value || "").trim();
          const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailVal || !emailRe.test(emailVal)) {
            if (emailError)
              emailError.textContent = "Please enter a valid email.";
            if (emailInput) emailInput.style.borderColor = "#f87171";
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
                email: usernameInput.value.trim(), // Using username field for email
                password: passwordInput.value,
              }),
            })
          : fetch(`${API_URL}/auth/register`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                email: emailInput?.value.trim() || "",
                password: passwordInput.value,
                displayName: usernameInput.value.trim(),
              }),
            });

        apiCall
          .then(async (res) => {
            if (!res.ok) {
              const errorData = await res.json().catch(() => ({ error: { message: "Request failed" } }));
              throw new Error(errorData.error?.message || `HTTP ${res.status}`);
            }
            return res.json();
          })
          .then((data) => {
            isSubmitting = false;
            primaryBtn.removeAttribute("disabled");
            primaryBtn.textContent = mode === "login" ? "Sign In" : "Create Account";

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
                  currentPage: "home",
                  userId: userId || undefined,
                  username: usernameInput.value.trim()
                });
              }
            } else {
              // Registration success - switch to login mode after brief success message
              primaryBtn.textContent = "✓ Account Created!";
              primaryBtn.className = "w-full bg-green-600 text-white px-4 py-2 rounded transition-colors";
              
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
            primaryBtn.textContent = mode === "login" ? "Sign In" : "Create Account";
            
            // Display error message
            const errorMsg = err.message || "An error occurred";
            if (mode === "login") {
              passwordError.textContent = errorMsg;
              passwordInput.style.borderColor = "#f87171";
            } else {
              if (emailError) {
                emailError.textContent = errorMsg;
              }
              if (emailInput) emailInput.style.borderColor = "#f87171";
            }
          });
      }
    );
    appendChildren(form, [primaryBtn]);

    const divider = createDiv("relative");
    const dividerLine = createDiv("absolute inset-0 flex items-center");
    const dividerBorder = createDiv("w-full border-t border-[#00C8FF]/30");
    dividerLine.appendChild(dividerBorder);
    const dividerText = createDiv("relative flex justify-center");
    const dividerSpan = createElement(
      "span",
      "bg-[#1a1a24] px-4 text-[#E0E0E0]/60"
    );
    dividerSpan.textContent = "or";
    dividerText.appendChild(dividerSpan);
    appendChildren(divider, [dividerLine, dividerText]);

    const signIn42Btn = createButton(
      "Sign in with 42",
      "w-full border border-[#00C8FF] bg-transparent text-[#00C8FF] hover:bg-[#00C8FF]/10 px-4 py-2 rounded inline-flex items-center justify-center gap-2 transition-colors"
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
    const content = createDiv("space-y-6");

    const header = createDiv("text-center space-y-4");
    const iconWrapper = createDiv("flex justify-center");
    const iconBox = createDiv(
      "h-16 w-16 rounded-full border-2 border-[#00C8FF] bg-[#00C8FF]/10 flex items-center justify-center"
    );
    iconBox.appendChild(createIcon("shield", "h-8 w-8 text-[#00C8FF]"));
    iconWrapper.appendChild(iconBox);

    const textGroup = createDiv();
    const title = createElement("h2", "text-[#00C8FF]");
    title.textContent = "Two-Factor Authentication";
    const subtitle = createElement("p", "text-[#E0E0E0]/60");
    subtitle.textContent = "Enter your 6-digit code";
    appendChildren(textGroup, [title, subtitle]);
    appendChildren(header, [iconWrapper, textGroup]);

    const qrWrapper = createDiv("flex justify-center");
    const qrBox = createDiv(
      "h-40 w-40 rounded border border-[#00C8FF] bg-[#121217] flex items-center justify-center"
    );
    qrBox.appendChild(createIcon("qrCode", "h-24 w-24 text-[#00C8FF]/50"));
    qrWrapper.appendChild(qrBox);

    const otpSection = createDiv("space-y-4");
    const otpWrapper = createDiv("flex justify-center gap-2");
    const otpInputs: HTMLInputElement[] = [];

    for (let i = 0; i < 6; i++) {
      const input = createInput(
        "text",
        "w-12 h-12 text-center border border-[#00C8FF]/50 bg-[#121217] text-[#E0E0E0] rounded focus:border-[#00C8FF] focus:outline-none focus:ring-2 focus:ring-[#00C8FF]/50"
      );
      input.maxLength = 1;
      input.addEventListener("input", (e) => {
        const target = e.target as HTMLInputElement;
        if (target.value && i < 5) otpInputs[i + 1].focus();
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Backspace" && !input.value && i > 0)
          otpInputs[i - 1].focus();
      });
      otpInputs.push(input);
      otpWrapper.appendChild(input);
    }

    const errorDiv = createDiv("text-sm text-red-400 text-center min-h-[1rem]");

    const verifyBtn = createButton(
      "Verify & Continue",
      "w-full bg-[#00C8FF] text-[#121217] hover:bg-[#00C8FF]/90 shadow-[0_0_10px_rgba(0,200,255,0.5)] px-4 py-2 rounded transition-colors",
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

        // Clear previous errors
        errorDiv.textContent = "";
        verifyBtn.setAttribute("disabled", "true");
        verifyBtn.textContent = "Verifying...";

        // Submit 2FA challenge
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
              const errorData = await res.json().catch(() => ({ error: { message: "Verification failed" } }));
              throw new Error(errorData.error?.message || `HTTP ${res.status}`);
            }
            return res.json();
          })
          .then((data) => {
            if (data.accessToken) {
              // Store tokens and update state
              setAuthTokens(data.accessToken, data.refreshToken);
              const userId = getUserId();
              appState.setState({ 
                isLoggedIn: true, 
                currentPage: "home",
                userId: userId || undefined
              });
            } else {
              throw new Error("No access token received");
            }
          })
          .catch((err) => {
            verifyBtn.removeAttribute("disabled");
            verifyBtn.textContent = "Verify & Continue";
            errorDiv.textContent = err.message || "Verification failed";
            // Clear inputs on error
            otpInputs.forEach(input => input.value = "");
            otpInputs[0].focus();
          });
      }
    );

    const backBtn = createButton(
      "Back to Login",
      "w-full text-[#E0E0E0]/60 hover:text-[#00C8FF] hover:bg-transparent px-4 py-2 rounded transition-colors",
      () => {
        card.innerHTML = "";
        card.appendChild(renderLoginForm());
      }
    );

    appendChildren(otpSection, [otpWrapper, errorDiv, verifyBtn, backBtn]);
    appendChildren(content, [header, qrWrapper, otpSection]);
    return content;
  }

  card.appendChild(renderLoginForm());
  wrapper.appendChild(card);
  container.appendChild(wrapper);
  return container;
}
