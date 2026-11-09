(() => {
    "use strict";

    const API_BASE = "https://payu-transparency.zhravann.workers.dev";
    const $ = (id) => document.getElementById(id);

    function todayIST() {
        return new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Kolkata",
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }).format(new Date());
    }

    function shiftDate(dateString, days) {
        const date = new Date(dateString + "T12:00:00Z");
        date.setUTCDate(date.getUTCDate() + days);
        return date.toISOString().slice(0, 10);
    }

    function formatMoney(value) {
        return new Intl.NumberFormat("en-IN", {
            style: "currency",
            currency: "INR",
            maximumFractionDigits: 2
        }).format(Number(value) || 0);
    }

    function formatPayUDate(value) {
        const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(String(value || ""));
        if (!match) return String(value || "—");
        const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
        const day = new Intl.DateTimeFormat("en-IN", {
            day: "2-digit", month: "short", year: "numeric", timeZone: "UTC"
        }).format(date);
        return match[4] ? day + ", " + match[4] + ":" + match[5] + " IST" : day;
    }

    function showMessage(message) {
        $("message-panel").textContent = message;
        $("message-panel").hidden = false;
    }

    function addCell(row, value, className) {
        const cell = document.createElement("td");
        cell.textContent = String(value ?? "—");
        if (className) cell.className = className;
        row.appendChild(cell);
    }

    function renderTransactions(transactions) {
        const tbody = $("transaction-rows");
        tbody.replaceChildren();

        transactions.forEach((transaction) => {
            const row = document.createElement("tr");
            addCell(row, formatPayUDate(transaction.date));
            addCell(row, transaction.reference, "reference");
            addCell(row, transaction.paymentMode || "—");
            addCell(row, formatMoney(transaction.amount), "amount");
            tbody.appendChild(row);
        });

        $("empty-state").hidden = transactions.length !== 0;
        if (transactions.length === 0) {
            const emptyRow = document.createElement("tr");
            const cell = document.createElement("td");
            cell.colSpan = 4;
            cell.className = "table-placeholder";
            cell.textContent = "No successful payments found for this date range.";
            emptyRow.appendChild(cell);
            tbody.appendChild(emptyRow);
        }
    }

    async function loadTransactions() {
        const from = $("from-date").value;
        const to = $("to-date").value;

        if (!from || !to || from > to) {
            showMessage("Please select a valid date range.");
            return;
        }

        const rangeLength = Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86400000);
        if (rangeLength > 30) {
            showMessage("Please choose a date range of 31 days or less.");
            return;
        }

        const button = $("apply-filter");
        button.disabled = true;
        button.textContent = "Loading…";
        $("message-panel").hidden = true;
        $("feed-status").textContent = "Fetching PayU records";
        $("transaction-rows").replaceChildren();

        try {
            const url = new URL("/api/public/transactions", API_BASE);
            url.searchParams.set("from", from);
            url.searchParams.set("to", to);

            const response = await fetch(url.toString(), {
                method: "GET",
                headers: { Accept: "application/json" },
                cache: "no-store"
            });

            const data = await response.json();
            if (!response.ok) {
                if (response.status === 503) {
                    throw new Error("PayU credentials are not configured on the secure Worker yet. The public site is connected, but live transaction data is waiting for the Worker secrets.");
                }
                throw new Error(data.message || "Unable to retrieve transactions from PayU.");
            }

            $("total-collected").textContent = formatMoney(data.summary.totalAmount);
            $("payment-count").textContent = String(data.summary.successfulPayments);
            $("average-payment").textContent = formatMoney(data.summary.averageAmount);
            $("range-label").textContent = from + " to " + to;
            renderTransactions(Array.isArray(data.transactions) ? data.transactions : []);
            $("feed-status").textContent = "Connected to PayU";
        } catch (error) {
            $("total-collected").textContent = "—";
            $("payment-count").textContent = "—";
            $("average-payment").textContent = "—";
            $("feed-status").textContent = "Feed unavailable";
            renderTransactions([]);
            showMessage(error instanceof Error ? error.message : "Unable to load payment data.");
        } finally {
            button.disabled = false;
            button.textContent = "Apply filter";
        }
    }

    function applyQuickRange(range) {
        const today = todayIST();
        $("to-date").value = today;
        $("from-date").value = range === "month"
            ? today.slice(0, 8) + "01"
            : shiftDate(today, -(Number(range) - 1));
        loadTransactions();
    }

    $("date-filter").addEventListener("submit", (event) => {
        event.preventDefault();
        loadTransactions();
    });

    document.querySelectorAll("[data-range]").forEach((button) => {
        button.addEventListener("click", () => applyQuickRange(button.dataset.range));
    });

    applyQuickRange("7");
})();
