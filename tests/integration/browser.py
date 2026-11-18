"""Optional browser coverage. Run with TEST_BROWSER=1 and Python Playwright installed."""
import os
import re
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

origin = os.environ["QA_ORIGIN"]
artifact_dir = os.environ.get("TEST_ARTIFACT_DIR")
def screenshot(page, name):
    if artifact_dir:
        page.screenshot(path=str(Path(artifact_dir) / name))

with sync_playwright() as driver:
    opts = {"headless": True}
    if os.environ.get("CHROMIUM_BIN"):
        opts["executable_path"] = os.environ["CHROMIUM_BIN"]
    browser = driver.chromium.launch(**opts)
    for width, height in [(1440, 960), (390, 844), (360, 800)]:
        context = browser.new_context(viewport={"width": width, "height": height})
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(origin)
        screenshot(page, f"login-{width}.png")
        page.get_by_label("Work email").fill("owner@example.test")
        page.get_by_label("Password", exact=True).fill(os.environ["QA_PASSWORD"])
        page.get_by_role("button", name="Sign in", exact=True).click()
        expect(page.get_by_role("heading", name="Billing overview")).to_be_visible()
        if width < 800:
            page.get_by_role("button", name="Open navigation").click()
        page.get_by_role("link", name="Workshop books").click()
        page.get_by_label("Accounting month").fill("2025-03")
        expect(page.get_by_role("heading", name="March 2025")).to_be_visible()
        screenshot(page, f"workshop-{width}.png")
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth+1"), "Page overflows horizontally"
        page.get_by_role("button", name="Attendance", exact=True).first.click()
        expect(page.get_by_role("heading", name="Daily attendance")).to_be_visible()
        page.get_by_label("Attendance date").fill("2025-03-05")
        expect(page.get_by_label("Attendance for Fixture Operator")).to_have_value("P")
        page.get_by_role("button", name="Reports", exact=True).first.click()
        expect(page.get_by_role("link", name="Download PDF")).to_be_visible()
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth+1")
        page.get_by_role("button", name="Sales", exact=True).first.click()
        page.get_by_role("button", name="Add job sale").click()
        entry = page.get_by_role("dialog")
        entry.get_by_label("Posting date").fill("2025-03-06")
        entry.get_by_label("Customer / sales register").select_option(label="Fictional Weave Studio")
        reference = "UI-" + str(width)
        entry.get_by_label("Party challan number").fill(reference)
        entry.get_by_label("Pieces", exact=True).fill("10")
        entry.get_by_label("Sort / rejected pieces").fill("2")
        entry.get_by_label("Rate per accepted piece (₹)").fill("20")
        entry.get_by_role("button", name="Save entry").click()
        expect(entry).to_have_count(0)
        expect(page.get_by_text(reference, exact=True).first).to_be_visible()
        if width < 800:
            page.get_by_role("button", name="Open navigation").click()
        page.get_by_role("link", name="Invoices", exact=True).click()
        page.get_by_role("button", name="New invoice").click()
        dialog = page.get_by_role("dialog")
        dialog.get_by_label("Customer", exact=True).select_option(label="Fictional Weave Studio")
        dialog.get_by_role("button", name="Workshop entries & PDF attachments").click()
        expect(dialog.get_by_text("Salary sheet", exact=True)).to_be_visible()
        assert not dialog.get_by_role("checkbox", name="Salary sheet", exact=True).is_checked()
        expect(dialog.get_by_role("checkbox", name="Salary sheet", exact=True)).to_be_enabled()
        screenshot(page, f"invoice-{width}.png")
        dialog.get_by_label("Source month").fill("2025-03")
        dialog.get_by_role("checkbox", name=re.compile(reference)).check()
        dialog.get_by_role("checkbox", name="Party sales & challans", exact=True).check()
        dialog.get_by_role("button", name="Create invoice", exact=True).click()
        expect(page.get_by_role("link", name="Download PDF")).to_be_visible()
        expect(page.get_by_text("Attached workshop statement", exact=True)).to_be_visible()
        expect(page.get_by_text(re.compile("Jobwork.*" + reference)).first).to_be_visible()
        assert not errors, errors
        context.close()
    browser.close()
print("Desktop and mobile login, navigation, reports, invoice attachments and overflow checks passed.")
