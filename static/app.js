document.addEventListener('DOMContentLoaded', () => {
    const chatForm = document.getElementById('chat-form');
    const userInput = document.getElementById('user-input');
    const chatMessages = document.getElementById('chat-messages');
    const sessionId = "session_" + Math.random().toString(36).substring(2, 9);

    async function sendChat(prompt, showInUi = true) {
        if (!prompt) return;

        if (showInUi) {
            appendMessage('user', prompt);
        }

        const tempBubble = appendMessage('agent', '...');

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt, session_id: sessionId })
            });
            const data = await response.json();
            tempBubble.remove();

            let text = data.text || "";
            let a2uiMessages = [];

            // 1. Extract <a2ui-json> blocks
            const a2uiRegex = /<a2ui-json>(.*?)<\/a2ui-json>/gs;
            let match;
            while ((match = a2uiRegex.exec(text)) !== null) {
                try {
                    const jsonStr = match[1].trim();
                    const parsed = JSON.parse(jsonStr);
                    const parsedList = Array.isArray(parsed) ? parsed : [parsed];
                    for (const msg of parsedList) {
                        if (msg && typeof msg === 'object') {
                            a2uiMessages.push(msg);
                        }
                    }
                } catch (e) {
                    console.error("Error parsing <a2ui-json> block:", e);
                }
            }

            // 2. Extract <a2a_datapart_json> blocks (for robust history/callback parsing)
            const a2aRegex = /<a2a_datapart_json>(.*?)<\/a2a_datapart_json>/gs;
            while ((match = a2aRegex.exec(text)) !== null) {
                try {
                    const jsonStr = match[1].trim();
                    const parsed = JSON.parse(jsonStr);
                    const dataMsg = (parsed && parsed.kind === 'data') ? parsed.data : parsed;
                    if (dataMsg && typeof dataMsg === 'object') {
                        a2uiMessages.push(dataMsg);
                    }
                } catch (e) {
                    console.error("Error parsing <a2a_datapart_json> block:", e);
                }
            }

            // 3. Clean XML and A2UI JSON tags from displayed conversational text
            const cleanText = text.replace(/<(a2ui-json|a2a_datapart_json)>.*?<\/\1>/gs, '').trim();

            const imageUrl = (data && typeof data === 'object' && data.image_url) ? data.image_url : null;
            appendMessage('agent', cleanText, imageUrl, a2uiMessages);
        } catch (error) {
            tempBubble.remove();
            appendMessage('agent', `Error: ${error.message}`);
        }
    }

    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const prompt = userInput.value.trim();
        if (!prompt) return;

        userInput.value = '';
        await sendChat(prompt, true);
    });

    function renderA2UI(a2uiMessages) {
        try {
            let rootId = null;
            const components = {};
            const dataModel = {};

            for (const msg of a2uiMessages) {
                if (msg.beginRendering) {
                    rootId = msg.beginRendering.root;
                } else if (msg.surfaceUpdate) {
                    for (const item of msg.surfaceUpdate.components) {
                        components[item.id] = item.component;
                    }
                } else if (msg.dataModelUpdate) {
                    for (const item of msg.dataModelUpdate.contents) {
                        const val = item.valueString !== undefined ? item.valueString :
                                    item.valueBool !== undefined ? item.valueBool :
                                    item.valueInt !== undefined ? item.valueInt :
                                    item.valueDouble !== undefined ? item.valueDouble : item.valueString;
                        dataModel[item.key] = val;
                    }
                }
            }

            if (!rootId || Object.keys(components).length === 0) {
                return null;
            }

            function resolveValue(valObj) {
                if (!valObj) return '';
                let val = '';
                if (typeof valObj === 'string') val = valObj;
                else if (valObj.literalString !== undefined) val = valObj.literalString;
                else if (valObj.path !== undefined) val = dataModel[valObj.path] || '';
                else val = JSON.stringify(valObj);

                // Dynamically replace any wrong session IDs in artifact URLs with the active sessionId
                if (typeof val === 'string' && val.includes('/api/artifacts/')) {
                    val = val.replace(/\/api\/artifacts\/session_[a-z0-9]+/g, `/api/artifacts/${sessionId}`);
                }
                return val;
            }

            function buildElement(id) {
                try {
                    const compDesc = components[id];
                    if (!compDesc) return null;

                    const type = Object.keys(compDesc)[0];
                    const props = compDesc[type];

                    const el = document.createElement('div');
                    el.className = `a2ui-component a2ui-${type.toLowerCase()}`;
                    el.style.margin = '4px 0';

                    if (type === 'Column') {
                        el.style.display = 'flex';
                        el.style.flexDirection = 'column';
                        el.style.gap = '8px';
                        const children = props.children?.explicitList || [];
                        for (const childId of children) {
                            const childEl = buildElement(childId);
                            if (childEl) el.appendChild(childEl);
                        }
                    } else if (type === 'Row') {
                        el.style.display = 'flex';
                        el.style.flexDirection = 'row';
                        el.style.gap = '8px';
                        el.style.alignItems = 'center';
                        const children = props.children?.explicitList || [];
                        for (const childId of children) {
                            const childEl = buildElement(childId);
                            if (childEl) el.appendChild(childEl);
                        }
                    } else if (type === 'Card') {
                        el.style.border = '1px solid #ddd';
                        el.style.borderRadius = '6px';
                        el.style.padding = '12px';
                        el.style.backgroundColor = '#fdfdfd';
                        el.style.marginTop = '8px';
                        if (props.child) {
                            const childEl = buildElement(props.child);
                            if (childEl) el.appendChild(childEl);
                        }
                    } else if (type === 'Text') {
                        const textVal = resolveValue(props.text);
                        const tag = props.usageHint === 'h1' ? 'h3' :
                                    props.usageHint === 'h2' ? 'h4' : 'p';
                        const textEl = document.createElement(tag);
                        textEl.textContent = textVal;
                        textEl.style.margin = '0 0 4px 0';
                        el.appendChild(textEl);
                    } else if (type === 'Image') {
                        const srcVal = resolveValue(props.url) || resolveValue(props.src);
                        const imgEl = document.createElement('img');
                        imgEl.src = srcVal;
                        imgEl.style.maxWidth = '100%';
                        imgEl.style.borderRadius = '4px';
                        imgEl.style.display = 'block';
                        imgEl.style.marginTop = '6px';
                        imgEl.className = 'generated-img';
                        el.appendChild(imgEl);
                    } else if (type === 'Divider') {
                        const hrEl = document.createElement('hr');
                        hrEl.style.border = '0';
                        hrEl.style.borderTop = '1px solid #eee';
                        hrEl.style.margin = '12px 0';
                        el.appendChild(hrEl);
                    } else if (type === 'MultipleChoice') {
                        const labelVal = resolveValue(props.label);
                        const options = props.options?.explicitList || (Array.isArray(props.options) ? props.options : []);

                        const container = document.createElement('div');
                        container.style.display = 'flex';
                        container.style.flexDirection = 'column';
                        container.style.gap = '4px';
                        container.style.margin = '8px 0';

                        if (labelVal) {
                            const labelEl = document.createElement('label');
                            labelEl.textContent = labelVal;
                            labelEl.style.fontSize = '12px';
                            labelEl.style.fontWeight = 'bold';
                            container.appendChild(labelEl);
                        }

                        const selectEl = document.createElement('select');
                        selectEl.className = 'a2ui-select';
                        selectEl.name = id;

                        for (const option of options) {
                            const optEl = document.createElement('option');
                            optEl.value = option.value !== undefined ? option.value : (option.id !== undefined ? option.id : '');
                            optEl.textContent = resolveValue(option.label);
                            selectEl.appendChild(optEl);
                        }
                        container.appendChild(selectEl);
                        el.appendChild(container);
                    } else if (type === 'Button') {
                        let labelVal = props.label ? resolveValue(props.label) : '';
                        if (!labelVal && props.child) {
                            const childComp = components[props.child];
                            if (childComp && childComp.Text) {
                                labelVal = resolveValue(childComp.Text.text);
                            }
                        }

                        const btnEl = document.createElement('button');
                        btnEl.className = 'btn-download';
                        btnEl.textContent = labelVal || 'Submit';

                        btnEl.addEventListener('click', (e) => {
                            e.preventDefault();

                            const action = props.action;
                            let downloadUrl = null;
                            if (action && (action.name === 'download_file' || action.name === 'download') && action.context) {
                                const urlContext = action.context.find(ctx => ctx.key === 'url');
                                if (urlContext) {
                                    downloadUrl = resolveValue(urlContext.value);
                                }
                            }

                            const isDownload = downloadUrl || (labelVal && labelVal.toLowerCase().includes('download'));
                            if (isDownload) {
                                const finalUrl = downloadUrl || (el.closest('.message')?.querySelector('img')?.src);
                                if (finalUrl) {
                                    const link = document.createElement('a');
                                    link.href = finalUrl;
                                    link.download = `generation-${Date.now()}.png`;
                                    link.click();
                                }
                            } else {
                                const bubbleEl = el.closest('.message');
                                const selects = bubbleEl.querySelectorAll('.a2ui-select');
                                let answers = [];
                                selects.forEach(sel => {
                                    let labelText = sel.previousSibling ? sel.previousSibling.textContent : sel.name;
                                    const selectedText = sel.options[sel.selectedIndex]?.textContent || sel.value;
                                    answers.push(`- ${labelText}: ${selectedText}`);
                                });

                                if (answers.length > 0) {
                                    const responseText = `Selected options:\n` + answers.join('\n');
                                    sendChat(responseText, false);
                                } else {
                                    sendChat(labelVal || 'Submit', false);
                                }
                            }
                        });
                        el.appendChild(btnEl);
                    }

                    return el;
                } catch (err) {
                    console.error('Error building component:', id, err);
                    return null;
                }
            }

            return buildElement(rootId);
        } catch (err) {
            console.error('Error in renderA2UI:', err);
            return null;
        }
    }

    function appendMessage(sender, text, imageUrl = null, a2ui = null) {
        const bubble = document.createElement('div');
        bubble.className = `message ${sender}`;

        const textSpan = document.createElement('span');
        textSpan.innerHTML = `<strong>${sender === 'user' ? 'You' : 'Agent'}:</strong> `;
        bubble.appendChild(textSpan);

        if (text) {
            const textContent = document.createTextNode(text);
            textSpan.appendChild(textContent);
        }

        if (sender === 'agent' && a2ui && a2ui.length > 0) {
            const a2uiEl = renderA2UI(a2ui);
            if (a2uiEl) {
                bubble.appendChild(a2uiEl);
            }
        }

        if (imageUrl) {
            const imgContainer = document.createElement('div');
            imgContainer.style.marginTop = '8px';
            const img = document.createElement('img');
            img.src = imageUrl;
            img.style.maxWidth = '100%';
            img.style.borderRadius = '4px';
            img.className = 'generated-img';
            imgContainer.appendChild(img);
            bubble.appendChild(imgContainer);
        }

        chatMessages.appendChild(bubble);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return bubble;
    }
});
