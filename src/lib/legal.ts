// Termos de uso e política de privacidade. O texto descreve o que o app faz de verdade: se mudar
// um fornecedor, um dado guardado ou a forma de cobrar, este arquivo muda junto (e a data também).

export const LEGAL_CONTACT = 'contato@capilario.com.br'
export const LEGAL_UPDATED = '26 de novembro de 2026'

export interface LegalSection {
  title: string
  /** Parágrafos; uma linha que começa com "• " vira item de lista. */
  body: string[]
}

export interface LegalDoc {
  title: string
  intro: string
  sections: LegalSection[]
}

export const TERMS: LegalDoc = {
  title: 'Termos de uso',
  intro:
    'Estes termos valem para quem usa o Capilário (capilario.com.br). Ao criar a conta ou usar o app, você concorda com eles e com a Política de privacidade.',
  sections: [
    {
      title: 'O que é o Capilário',
      body: [
        'Um diário pessoal do cabelo. Você registra as finalizações com fotos (molhado, seco e dia seguinte), a rotina e os produtos que usou, e compara os resultados.',
        'O app também oferece recursos com inteligência artificial: a análise das fotos de uma finalização e a identificação de produtos pela foto da embalagem.',
      ],
    },
    {
      title: 'Sua conta',
      body: [
        'Para usar, é preciso ter 18 anos ou mais e uma conta com e-mail e senha. Por enquanto, o acesso é por convite.',
        'Use um e-mail seu e uma senha que só você conheça. Você responde pelo que for feito com a sua conta.',
        'Você pode excluir a conta quando quiser, em Minha conta. Com isso, as fotos e os registros são apagados.',
      ],
    },
    {
      title: 'Planos',
      body: [
        'Há o plano Grátis e o plano Pro. Os limites de cada um (análises, identificações e fotos) aparecem no app.',
        'Quando a assinatura do Pro abrir, o preço, a forma de cobrança e como cancelar serão mostrados antes da contratação. A lei garante 7 dias de arrependimento a partir da contratação, com reembolso integral.',
      ],
    },
    {
      title: 'A inteligência artificial',
      body: [
        'As análises e as identificações são geradas automaticamente e podem errar. Confira as informações antes de tomar decisões.',
        'O Capilário não dá orientação médica. Para queda, coceira, feridas ou outra alteração no couro cabeludo, procure um dermatologista.',
      ],
    },
    {
      title: 'Suas fotos e registros',
      body: [
        'O que você envia continua sendo seu. Você autoriza o Capilário apenas a guardar, processar e mostrar esse conteúdo para você, e a enviá-lo aos fornecedores listados na Política de privacidade quando for necessário para um recurso funcionar.',
        'Envie só fotos suas ou de quem autorizou. Não é permitido enviar nudez ou conteúdo ilegal.',
        'Quando você compartilha um PDF, é você quem escolhe para quem. O que a outra pessoa faz com ele fica fora do controle do Capilário.',
      ],
    },
    {
      title: 'O que não é permitido',
      body: [
        '• Tentar acessar dados de outras pessoas ou partes do sistema que não são suas.',
        '• Usar robôs ou scripts para usar o app de forma automatizada, ou contornar os limites dos planos.',
        '• Atrapalhar o funcionamento do serviço ou usá-lo para algo ilegal.',
        'Nesses casos, a conta pode ser suspensa ou encerrada.',
      ],
    },
    {
      title: 'Marcas',
      body: [
        'Os nomes, as marcas e as fotos dos produtos pertencem aos fabricantes. Eles aparecem só para identificar o que você usou. O Capilário não tem ligação com nenhuma marca e não recebe nada para mostrá-las.',
      ],
    },
    {
      title: 'Funcionamento',
      body: [
        'O Capilário faz o possível para estar sempre no ar e manter seus dados seguros, mas pode ficar fora do ar em alguns momentos ou ter falhas.',
        'Recursos podem mudar, ser incluídos ou deixar de existir. Se uma mudança afetar o que você paga, você será avisado antes.',
      ],
    },
    {
      title: 'Responsabilidade',
      body: [
        'O Capilário responde pelos danos que causar, nos termos da lei e do Código de Defesa do Consumidor. Não responde pelo resultado de produtos ou rotinas que você escolher usar.',
      ],
    },
    {
      title: 'Mudanças nestes termos',
      body: [
        'Se os termos mudarem de forma importante, você será avisado no app ou por e-mail antes de a mudança valer. A data da última atualização fica no fim desta página.',
      ],
    },
    {
      title: 'Lei e contato',
      body: [
        'Valem as leis do Brasil. Qualquer disputa pode ser levada ao foro da cidade onde você mora.',
        `Dúvidas, pedidos ou reclamações: ${LEGAL_CONTACT}.`,
      ],
    },
  ],
}

export const PRIVACY: LegalDoc = {
  title: 'Política de privacidade',
  intro:
    'Esta política explica quais dados o Capilário guarda, para quê, com quem compartilha e como você controla tudo isso, de acordo com a Lei Geral de Proteção de Dados (LGPD). O Capilário é o responsável pelos seus dados.',
  sections: [
    {
      title: 'O que guardamos',
      body: [
        '• Conta: seu e-mail e a senha, guardada de forma cifrada (nem nós conseguimos lê-la).',
        '• Fotos: as fotos do cabelo que você tira ou envia, que podem mostrar seu rosto, e as fotos das embalagens dos produtos.',
        '• Registros: produtos, marcas, rotinas, datas e horários das finalizações, observações e os resultados das análises da IA.',
        '• Clima: a umidade, a temperatura e o tempo (sol, nublado, chuva) da hora de cada foto.',
        '• Uso do plano: quantas análises e identificações você já usou, para aplicar os limites.',
      ],
    },
    {
      title: 'O que não guardamos',
      body: [
        'Sua localização. Para saber o clima, o app pede a localização do aparelho, arredonda para cerca de 1 km e pergunta o clima daquele ponto. Só os números do clima ficam salvos. Se você não permitir a localização, o app funciona normalmente, sem o clima.',
        'Também não fazemos reconhecimento facial, não mostramos anúncios, não usamos ferramentas de rastreamento e não vendemos dados.',
      ],
    },
    {
      title: 'Para que usamos',
      body: [
        'Só para o app funcionar para você: mostrar seu diário, comparar finalizações, gerar análises e PDFs, identificar produtos, mandar os e-mails da conta (confirmação e senha nova) e aplicar os limites do plano.',
        'A base legal é a execução do serviço que você contratou (art. 7º, V, da LGPD). A localização só é usada com a sua permissão, dada no próprio aparelho.',
      ],
    },
    {
      title: 'Com quem compartilhamos',
      body: [
        'Só com os fornecedores que fazem o app funcionar, e apenas o necessário:',
        '• Supabase: guarda a conta, as fotos e os registros, em servidores em São Paulo.',
        '• Anthropic (Claude): recebe as fotos quando você pede uma análise ou uma identificação de produto. Não usa esses dados para treinar a IA.',
        '• Resend: envia os e-mails da conta para o seu endereço.',
        '• Open-Meteo: recebe a localização arredondada, sem nenhum dado seu, e devolve o clima.',
        '• GitHub Pages: hospeda o site e recebe dados técnicos de acesso, como o endereço IP.',
        'Alguns desses fornecedores ficam fora do Brasil (Estados Unidos e Europa). Nesses casos, a transferência segue as regras da LGPD e as garantias contratuais deles.',
        'Também podemos compartilhar dados se uma lei ou uma ordem judicial exigir.',
      ],
    },
    {
      title: 'Segurança',
      body: [
        'A conexão é sempre cifrada (HTTPS). Cada conta só enxerga os próprios dados, inclusive as fotos, que ficam em armazenamento privado. As chaves de acesso aos serviços ficam só nos servidores, nunca no app.',
      ],
    },
    {
      title: 'Por quanto tempo',
      body: [
        'Enquanto a conta existir. Quando você exclui uma foto, uma finalização ou um produto, ele é apagado de verdade, não vai para uma lixeira.',
        'Quando você exclui a conta, em Minha conta, todas as fotos e registros são apagados de uma vez. Cópias de segurança automáticas dos fornecedores somem em poucos dias, no ciclo normal deles.',
      ],
    },
    {
      title: 'Seus direitos',
      body: [
        'Pela LGPD, você pode, a qualquer momento:',
        '• confirmar se tratamos seus dados e ter acesso a eles;',
        '• corrigir dados incompletos ou errados;',
        '• pedir uma cópia dos seus dados (portabilidade);',
        '• pedir a exclusão dos dados;',
        '• saber com quem os dados são compartilhados;',
        '• retirar uma permissão dada, como a da localização.',
        `Quase tudo dá para fazer no próprio app: editar ou apagar registros, trocar o e-mail e excluir a conta. Para o resto, escreva para ${LEGAL_CONTACT}. Respondemos em até 15 dias. Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).`,
      ],
    },
    {
      title: 'No seu aparelho',
      body: [
        'O app guarda no navegador a sua sessão (para você não precisar entrar toda vez) e algumas preferências de tela, como a última aba aberta. Isso fica só no aparelho. A sessão some quando você sai da conta, e o resto, quando você limpa os dados do navegador.',
      ],
    },
    {
      title: 'Mudanças nesta política',
      body: [
        'Se mudarmos algo importante, como incluir um fornecedor novo ou passar a guardar outro tipo de dado, avisaremos no app ou por e-mail antes. A data da última atualização fica no fim desta página.',
      ],
    },
  ],
}
