// Quick test to reproduce browser fetch behavior

const API_KEY = 'SZjSDYNBd2RN+5bi+HASPst87s+GByN1QJaEaZrcFf8veyAQydEuGZ3deRY8/9EgVIGQNs4lnGMzV5nzFvkY3RatvqjB/SyLaxWYvKaR0O6nWCZVkEjEkalYbmxL';

// System prompt WITH HTML tags (from failing_payload.json)
const SYSTEM_PROMPT_WITH_HTML = `You are Simulacrum, an AI assistant for FoundryVTT. You strive to assist the user in world-building, context gathering, and document creation. You always respond with natural language, using HTML tags for emphatic formatting (such as <strong>, <em>, <p>, <ul>, <ol>, <li>, <h1>-<h6>). Even when invoking a tool call, you are communicative of your intentions.`;

// System prompt WITHOUT HTML tags
const SYSTEM_PROMPT_NO_HTML = `You are Simulacrum, an AI assistant for FoundryVTT. You strive to assist the user in world-building, context gathering, and document creation. You always respond with natural language, using Markdown for emphatic formatting (bold, italics, lists). Even when invoking a tool call, you are communicative of your intentions.`;

async function testFetch(label, systemPrompt) {
    console.log(`\n=== TEST: ${label} ===`);

    const url = new URL('https://api.llm7.io/v1/chat/completions');
    url.searchParams.append('api_key', API_KEY);

    const body = {
        model: 'codestral-2501',
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: 'hello' }
        ],
        max_tokens: 100,
        temperature: 0.7
    };

    console.log('System prompt length:', systemPrompt.length);
    console.log('Total body length:', JSON.stringify(body).length);

    try {
        const response = await fetch(url.toString(), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify(body)
        });

        console.log('Status:', response.status, response.statusText);
        const data = await response.json();
        console.log('Response:', JSON.stringify(data).substring(0, 300));
        return response.status;
    } catch (err) {
        console.error('Error:', err.message);
        return -1;
    }
}

async function main() {
    const status1 = await testFetch('WITH HTML TAGS', SYSTEM_PROMPT_WITH_HTML);

    // Wait a bit to avoid rate limiting
    await new Promise(r => setTimeout(r, 2000));

    const status2 = await testFetch('WITHOUT HTML TAGS', SYSTEM_PROMPT_NO_HTML);

    console.log('\n=== SUMMARY ===');
    console.log(`WITH HTML: ${status1 === 200 ? 'PASS' : 'FAIL'} (${status1})`);
    console.log(`WITHOUT HTML: ${status2 === 200 ? 'PASS' : 'FAIL'} (${status2})`);
}

main();
