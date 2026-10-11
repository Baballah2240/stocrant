const email = import.meta.env.VITE_CONTACT_EMAIL || "";
export const api = { public: {
  info: async () => ({ email, phone: import.meta.env.VITE_CONTACT_PHONE || "" }),
  contact: async (form: { name: string; email: string; company: string; message: string; website: string }) => {
    if (!email) throw new Error("Email contact is not configured for this website yet.");
    if (form.website) return;
    const subject = `STOCRANT inquiry from ${form.name}`;
    const body = `Name: ${form.name}\nEmail: ${form.email}\nCompany: ${form.company}\n\n${form.message}`;
    window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  },
} };
