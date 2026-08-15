import express, { Request, Response } from 'express';
import axios from 'axios';
import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

// Inicializa o SDK do Claude da Anthropic
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Configurações e regras de negócio da Academia 180 Focus
const SYSTEM_PROMPT = `
Você é o assistente virtual inteligente da 'Academia 180 Focus', localizada em Luanda, Angola.
Seu objetivo é atender os clientes de forma educada, prestativa e profissional, usando expressões naturais de Angola se apropriado.

Aqui estão os dados oficiais que você deve usar obrigatoriamente para responder:
1. HORÁRIOS DE FUNCIONAMENTO:
   - Segunda a Sexta: 05:30 às 22:00
   - Sábados: 07:00 às 15:00
   - Domingos e Feriados: 08:00 às 12:00

2. PLANOS E PREÇOS (Moeda: Kwanza - Kz):
   - Plano Mensal: 15.000 Kz (Livre trânsito na musculação)
   - Plano Trimestral: 40.000 Kz (Musculação + Acesso a 1 modalidade coletiva)
   - Plano Anual: 140.000 Kz (Acesso total a todas as áreas, avaliação física inclusa, sem taxa de inscrição)
   - Taxa de Inscrição padrão: 5.000 Kz (grátis no plano anual)

3. HORÁRIO DAS AULAS COLETIVAS:
   - Cross Training: Segunda, Quarta e Sexta às 18:30 (Instrutor: Carlos)
   - Zumba / Dança: Terça e Quinta às 19:00 (Instrutora: Ana)
   - Pilates: Sábados às 09:00 (Instrutora: Maria)

Regras de comportamento:
- Nunca invente preços, planos ou horários fora destes dados.
- Seja direto e amigável.
- Se o cliente quiser falar com um humano, diga que vai encaminhar para o suporte no número +244 923 000 000.
`;

// 1. ROTA DE VALIDAÇÃO DO WEBHOOK (Necessária para configurar na Meta/Facebook Developers)
app.get('/webhook', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      console.log('WEBHOOK_VERIFICADO');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});

// 2. ROTA QUE RECEBE AS MENSAGENS DOS ALUNOS NO WHATSAPP
app.post('/webhook', async (req: Request, res: Response) => {
  try {
    const body = req.body;

    // Verifica se a estrutura da mensagem recebida do WhatsApp é válida
    if (body.object && body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
      const messageData = body.entry[0].changes[0].value.messages[0];
      const fromNumber = messageData.from; // Número do cliente
      const clientMessage = messageData.text?.body; // Texto que o cliente enviou

      if (clientMessage) {
        console.log(`Mensagem recebida de ${fromNumber}: ${clientMessage}`);

        // Chamar o Claude (Anthropic) para gerar a resposta com base no contexto da academia
        const responseFromClaude = await anthropic.messages.create({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: clientMessage }],
        });

        // Extrai o texto gerado pelo Claude de forma segura
        const textReply = responseFromClaude.content[0].type === 'text' 
          ? responseFromClaude.content[0].text 
          : 'Olá! Como posso ajudar você na Academia 180 Focus hoje?';

        // Envia a resposta gerada de volta para o WhatsApp do cliente
        await sendWhatsAppMessage(fromNumber, textReply);
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('Erro ao processar o webhook:', error);
    res.sendStatus(500);
  }
});

// FUNÇÃO AUXILIAR PARA ENVIAR A MENSAGEM VIA API DO WHATSAPP CLOUD
async function sendWhatsAppMessage(toNumber: string, text: string) {
  const url = `https://facebook.com{process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  
  await axios.post(
    url,
    {
      messaging_product: 'whatsapp',
      to: toNumber,
      type: 'text',
      text: { body: text },
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      },
    }
  );
}

// INICIA O SERVIDOR
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Cortex Digital - Agente da Academia 180 Focus rodando na porta ${PORT}`);
});
