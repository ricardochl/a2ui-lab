document.addEventListener('DOMContentLoaded', () => {
    const chatForm = document.getElementById('chat-form');
    const userInput = document.getElementById('user-input');
    const chatMessages = document.getElementById('chat-messages');
    const sessionId = "session_" + Math.random().toString(36).substring(2, 9);

    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const prompt = userInput.value.trim();
        if (!prompt) return;

        userInput.value = '';
        appendMessage('user', prompt);

        const tempBubble = appendMessage('agent', '...');

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt, session_id: sessionId })
            });
            const data = await response.json();
            tempBubble.remove();

            const textValue = (data && typeof data === 'object' && data.text) ? data.text : "";
            const imageUrl = (data && typeof data === 'object' && data.image_url) ? data.image_url : null;
            appendMessage('agent', textValue, imageUrl);
        } catch (error) {
            tempBubble.remove();
            appendMessage('agent', `Error: ${error.message}`);
        }
    });

    function appendMessage(sender, text, imageUrl = null) {
        const bubble = document.createElement('div');
        bubble.className = `message ${sender}`;

        const content = document.createElement('span');
        content.innerHTML = `<strong>${sender === 'user' ? 'You' : 'Agent'}:</strong> `;

        const textNode = document.createTextNode(text);
        content.appendChild(textNode);
        bubble.appendChild(content);

        // Always format multi-line JSON blocks nicely if the message is from the agent and looks like JSON
        if (sender === 'agent' && text && (text.startsWith('{') || text.startsWith('['))) {
            bubble.style.fontFamily = 'monospace';
            bubble.style.whiteSpace = 'pre-wrap';
            bubble.style.fontSize = '12px';
        }

        if (imageUrl) {
            const card = document.createElement('div');
            card.className = 'image-card';
            const img = document.createElement('img');
            img.src = imageUrl;
            img.className = 'generated-img';
            card.appendChild(img);

            const dlBtn = document.createElement('button');
            dlBtn.className = 'btn-download';
            dlBtn.textContent = 'Download PNG';
            dlBtn.onclick = () => {
                const link = document.createElement('a');
                link.href = imageUrl;
                link.download = `generation-${Date.now()}.png`;
                link.click();
            };
            card.appendChild(dlBtn);
            bubble.appendChild(card);
        }

        chatMessages.appendChild(bubble);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return bubble;
    }
});
