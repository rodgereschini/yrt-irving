/**
 * Keep signups in the chapter's existing Google Form.
 *
 * Google Forms has no public response-creation API. This adapter uses the
 * public form's normal submission action and checks its confirmation page.
 * It can stop working if Google changes that action or the owner changes the
 * questions. The original form is the fallback; never treat an HTTP 200 alone
 * as a recorded signup, and never automatically repeat a submission.
 */
export const GOOGLE_FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLSdgR_7sZHjPlY1AePgv7UKmRWUFgGaydVZdMUBrmGCEKIgJ9Q/viewform";
const GOOGLE_FORM_ACTION = GOOGLE_FORM_URL.replace("/viewform", "/formResponse");
const FIELD_IDS = {
    name: "1551974661",
    email: "1555561389",
    phone: "1869623792",
};
const MAX_BODY_BYTES = 4096;
const TIMEOUT_MS = 12000;
function json(body, status) {
    return Response.json(body, {
        status,
        headers: {
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    });
}
function fail(status, code, message, submissionState = "not_sent", fieldErrors) {
    return json({
        ok: false,
        code,
        message,
        formUrl: GOOGLE_FORM_URL,
        submissionState,
        ...(fieldErrors ? { fieldErrors } : {}),
    }, status);
}
async function readBoundedBody(request) {
    const reader = request.body?.getReader();
    if (!reader)
        return "";
    const chunks = [];
    let size = 0;
    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done)
                break;
            size += value.byteLength;
            if (size > MAX_BODY_BYTES) {
                await reader.cancel();
                return null;
            }
            chunks.push(value);
        }
    }
    finally {
        reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return new TextDecoder().decode(bytes);
}
function cleanValue(value) {
    return typeof value === "string" ? value.trim() : "";
}
function validate(fields) {
    const errors = {};
    const controls = /[\u0000-\u001f\u007f]/;
    if (!fields.name || fields.name.length > 120 || controls.test(fields.name)) {
        errors.name = "Please enter your name (up to 120 characters).";
    }
    if (fields.email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email) ||
        controls.test(fields.email)) {
        errors.email = "Please enter a valid email address.";
    }
    const phoneDigits = fields.phone.replace(/\D/g, "").length;
    if (fields.phone.length > 40 ||
        phoneDigits < 7 ||
        phoneDigits > 20 ||
        controls.test(fields.phone)) {
        errors.phone = "Please enter a valid phone number.";
    }
    return errors;
}
/** Validate the current public form before sending any personal information. */
function inspectForm(html) {
    const token = html.match(/name=["']fbzx["'][^>]*value=["'](-?\d+)["']/)?.[1];
    const data = html.match(/FB_PUBLIC_LOAD_DATA_\s*=\s*(\[[\s\S]*?\]);\s*<\/script>/)?.[1];
    if (!token || !data)
        return null;
    try {
        const schema = JSON.parse(data);
        const questions = schema?.[1]?.[1];
        if (!Array.isArray(questions))
            return null;
        const expected = new Set(Object.values(FIELD_IDS));
        const found = new Set();
        for (const question of questions) {
            if (!Array.isArray(question?.[4]))
                continue;
            for (const entry of question[4]) {
                const id = String(entry?.[0]);
                if (expected.has(id)) {
                    // These fields are short-text questions. A changed type needs review.
                    if (question[3] !== 0)
                        return null;
                    found.add(id);
                }
                else if (entry?.[2] === 1) {
                    // A newly required field must be handled in the original form.
                    return null;
                }
            }
        }
        return found.size === expected.size ? { token } : null;
    }
    catch {
        return null;
    }
}
function isRecordedConfirmation(html) {
    // Strip scripts/styles before matching so JavaScript strings and a form's
    // question text cannot masquerade as the submitted confirmation screen.
    const visibleHtml = html
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
    if (/<form\b[^>]*\bid=["']mG61Hd["']/i.test(visibleHtml))
        return false;
    const confirmation = visibleHtml.match(/<div\b[^>]*\bclass=["'][^"']*\bvHW8K\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1];
    return !!confirmation && /\bYour response has been recorded\./i.test(confirmation.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " "));
}
export async function handleSignup(request, fetcher = fetch) {
    if (request.method !== "POST") {
        return fail(405, "method_not_allowed", "Please use the signup form to join the list.");
    }
    const origin = request.headers.get("Origin");
    if ((origin && origin !== new URL(request.url).origin) ||
        request.headers.get("Sec-Fetch-Site") === "cross-site") {
        return fail(403, "origin_not_allowed", "Please submit this form from the chapter website.");
    }
    if (Number(request.headers.get("Content-Length")) > MAX_BODY_BYTES) {
        return fail(413, "body_too_large", "This form is too large. Please check the fields and try again.");
    }
    if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) {
        return fail(415, "unsupported_content_type", "Please use the signup form or open the original form.");
    }
    let input;
    try {
        const body = await readBoundedBody(request);
        if (body === null) {
            return fail(413, "body_too_large", "This form is too large. Please check the fields and try again.");
        }
        input = JSON.parse(body);
        if (!input || typeof input !== "object" || Array.isArray(input))
            throw new Error("Invalid input");
    }
    catch {
        return fail(400, "invalid_body", "We couldn't read the form. Please check the fields and try again.");
    }
    if (cleanValue(input.website)) {
        return fail(422, "submission_blocked", "We couldn't submit this form. Please open the original signup form.");
    }
    const fields = {
        name: cleanValue(input.name),
        email: cleanValue(input.email),
        phone: cleanValue(input.phone),
    };
    const errors = validate(fields);
    if (Object.keys(errors).length) {
        return fail(422, "validation_error", "Please check the highlighted fields.", "not_sent", errors);
    }
    let form;
    try {
        const upstream = await fetcher(`${GOOGLE_FORM_URL}?hl=en`, {
            headers: { "Accept-Language": "en-US,en;q=0.9", Accept: "text/html" },
            redirect: "follow",
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!upstream.ok)
            throw new Error("Form unavailable");
        form = inspectForm(await upstream.text());
        if (!form)
            throw new Error("Form changed or unavailable");
    }
    catch {
        return fail(503, "form_unavailable", "We couldn't connect to the signup form. Your details haven't been sent. Please use the original form below.");
    }
    const payload = new URLSearchParams({
        [`entry.${FIELD_IDS.name}`]: fields.name,
        [`entry.${FIELD_IDS.email}`]: fields.email,
        [`entry.${FIELD_IDS.phone}`]: fields.phone,
        fvv: "1",
        pageHistory: "0",
        fbzx: form.token,
    });
    try {
        // Exactly one POST: a timeout may mean Google recorded the response.
        // Repeating it automatically could create duplicate list entries.
        const upstream = await fetcher(`${GOOGLE_FORM_ACTION}?hl=en`, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
                "Accept-Language": "en-US,en;q=0.9",
                Accept: "text/html",
            },
            body: payload,
            redirect: "follow",
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        const html = await upstream.text();
        if (upstream.ok && isRecordedConfirmation(html)) {
            return json({ ok: true, message: "You're on the list. Thanks for getting involved!" }, 200);
        }
        if ([400, 403, 429].includes(upstream.status) ||
            /<form\b[^>]*\bid=["']mG61Hd["']/i.test(html)) {
            return fail(502, "form_rejected", "The signup form couldn't accept these details. Please complete the original form below.", "rejected");
        }
    }
    catch {
        // Do not disclose upstream messages, submitted values, or network details.
    }
    return fail(502, "confirmation_unavailable", "We couldn't confirm your signup. It may have reached us, so please don't submit it again yet. Email yrtirving@gmail.com if you'd like us to check.", "uncertain");
}

/** Native Cloudflare Pages entrypoints. No bindings or environment variables are required. */
export function onRequestPost({ request }) {
  return handleSignup(request);
}

async function rejectOtherMethod({ request }) {
  const response = await handleSignup(request);
  response.headers.set("Allow", "POST");
  return response;
}

export const onRequestGet = rejectOtherMethod;
export const onRequestHead = rejectOtherMethod;
export const onRequestOptions = rejectOtherMethod;
export const onRequestPut = rejectOtherMethod;
export const onRequestPatch = rejectOtherMethod;
export const onRequestDelete = rejectOtherMethod;
