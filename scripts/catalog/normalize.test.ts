import { describe, expect, it } from 'vitest'
// @ts-expect-error módulo JS dos scripts (sem tipos)
import { audienceOf, brandDisplay, classify, cleanName, isHairProduct, mergeKey, vtexSized } from './normalize.mjs'

describe('classify', () => {
  it('tipo pelo nome, do mais específico para o geral', () => {
    expect(classify('Batiste Dry Shampoo Original - Shampoo A Seco 200ml')).toBe('shampoo_seco')
    expect(classify('Shampoo Elseve Liss-Intense Extreme 400ml')).toBe('shampoo')
    expect(classify('Wella Professionals Invigo Sun Leave In Bifásico 150ml')).toBe('leave_in')
    expect(classify('Creme Para Pentear Seda Ceramidas 300ml')).toBe('creme_pentear')
    expect(classify('Geleia Seladora Widi Care Modelando a Juba 300g')).toBe('geleia')
    expect(classify('Pomada Modeladora Kpro Two')).toBe('pomada')
    expect(classify('Cera Modeladora Efeito Matte QOD Barber Shop 70g')).toBe('cera')
    expect(classify('Widi Care Juba - Mousse Criador de Cachos 200ml')).toBe('mousse')
    expect(classify('Óleo Capilar Lola Cosmetics Argan Oil')).toBe('oleo')
    expect(classify('Finalizador Spray Niely Gold Day After 120ml')).toBe('spray')
    expect(classify('Máscara Capilar Pantene Reconstrução Molecular 270ml')).toBe('mascara')
    expect(classify('Yellow Style Blow Dryer 250ml')).toBe('protetor_termico')
  })

  it('fora: kits, cor, alisamento, acessórios, rosto e barba', () => {
    expect(classify('Kit Lola From Rio - Leave-In 50ml + Óleo 50ml')).toBeNull()
    expect(classify('Coloração Igora Royal 7-0')).toBeNull()
    expect(classify('Escova Progressiva Inoar G-Hair 1L')).toBeNull()
    expect(classify('Tesoura para Cabelo em Aço Inox 6"')).toBeNull()
    expect(classify('Sérum Facial com Ácido Hialurônico 30ml')).toBeNull()
    expect(classify('Óleo para Barba QOD 30ml')).toBeNull()
    expect(classify('Máscara de Tratamento', ['/Cabelos/Kits para Cabelos/'])).toBeNull()
  })

  it('sem pista no nome: usa o caminho da loja', () => {
    expect(classify('Bed Head Tigi Resurrection', ['/Cabelos/Condicionador/'])).toBe('condicionador')
    expect(classify('Real Rigen Reparador', ['/Cabelos/Finalizadores e Modeladores/'])).toBe('finalizador')
  })
})

describe('isHairProduct', () => {
  it('categorias mistas pedem palavra de cabelo', () => {
    expect(isHairProduct('Sérum Facial Eucerin 30ml', ['/Dermocosméticos/Sérum/'])).toBe(false)
    expect(isHairProduct('Sérum Capilar Reparador de Pontas', ['/Dermocosméticos/Sérum/'])).toBe(true)
    expect(isHairProduct('Qualquer coisa', ['/Cabelos/Shampoo/'])).toBe(true)
  })
})

describe('audienceOf', () => {
  it('masculino e feminino pelo nome ou pelo campo da loja', () => {
    expect(audienceOf('Pomada QOD Barber Shop Walk')).toBe('masculino')
    expect(audienceOf('Shampoo Clear Men Anticaspa')).toBe('masculino')
    expect(audienceOf('Shampoo Clear Women Sports')).toBe('feminino')
    expect(audienceOf('Shampoo Elseve', ['Todos'])).toBe('unissex')
    expect(audienceOf('Shampoo Qualquer', ['Masculino'])).toBe('masculino')
  })
})

describe('cleanName', () => {
  it('tira marca e tamanho, mantém o resto', () => {
    expect(cleanName('Geleia Seladora Widi Care Modelando a Juba 300g', 'Widi Care')).toBe('Geleia Seladora Modelando a Juba')
    expect(cleanName('Pomada Capilar QOD Barber Shop Walk 70g', 'QOD Cosmetics')).toBe('Pomada Capilar Barber Shop Walk')
    expect(cleanName('Óleo Wella Oil Reflections - 100ml', 'Wella Professionals')).toBe('Óleo Oil Reflections')
    expect(cleanName('Wella Professionals Invigo Sun Leave In Bifásico 150ml', 'Wella Professionals')).toBe('Invigo Sun Leave In Bifásico')
    expect(cleanName('Máscara de Tratamento Kérastase Résistance Masque Thérapiste', 'Kerastase')).toBe('Máscara de Tratamento Résistance Masque Thérapiste')
    expect(cleanName('Shampoo Anticaspa Vichy Dercos Refil 200g', 'Dercos', ['Vichy'])).toBe('Shampoo Anticaspa')
  })

  it('nome que era só a marca: não some', () => {
    expect(cleanName('Moroccanoil 100ml', 'Moroccanoil')).toBe('Moroccanoil')
  })
})

describe('mergeKey e marca', () => {
  it('mesmo produto com palavras em outra ordem e tamanho diferente', () => {
    expect(mergeKey('widi-care', 'Geleia Seladora Modelando a Juba')).toBe(mergeKey('widi-care', 'Modelando a Juba Geleia Seladora'))
  })
  it('grafia da marca', () => {
    expect(brandDisplay(['WIDI CARE', 'Widi Care', 'Widi Care'])).toBe('Widi Care')
    expect(brandDisplay(['SALON LINE'])).toBe('Salon Line')
    expect(brandDisplay(['QOD'])).toBe('QOD')
  })
  it('imagem VTEX no tamanho pedido', () => {
    expect(vtexSized('https://x.vteximg.com.br/arquivos/ids/1121404/two.jpg?v=1')).toBe('https://x.vteximg.com.br/arquivos/ids/1121404-800-800/two.jpg?v=1')
    expect(vtexSized('https://x.vteximg.com.br/arquivos/ids/1121404-55-55/two.jpg')).toBe('https://x.vteximg.com.br/arquivos/ids/1121404-800-800/two.jpg')
  })
})

describe('ajustes da primeira revisão', () => {
  it('marca com & e palavra comum não come o nome', () => {
    expect(cleanName('Shampoo Anticaspa Head & Shoulders Anticoceira Eucalipto 400ml', 'Head & Shoulders')).toBe('Shampoo Anticaspa Anticoceira Eucalipto')
  })
  it('nome todo em maiúsculas vira título', () => {
    expect(cleanName('CONDICIONADOR PREMIUM MOIST AND REPAIR 450ML TSUBAKI', 'Tsubaki')).toBe('Condicionador Premium Moist and Repair')
  })
  it('cor fica de fora; pré-shampoo é pré-shampoo', () => {
    expect(classify('Wella Soft Color - 28 - Preto Azulado')).toBeNull()
    expect(classify('Mascara Yellow Professional Color Mask .35 Warm Browm 200 ml')).toBeNull()
    expect(classify('Pré Shampoo Elseve Bond Repair 200ml')).toBe('pre_shampoo')
    expect(classify('Shampoo Matizador Desamarelador 300ml')).toBe('shampoo')
  })
  it('departamento masculino da loja marca o público', () => {
    expect(audienceOf('Pomada Modeladora Kpro Petit', null, ['/Homens/Cabelos/Ceras e Pomadas/'])).toBe('masculino')
  })
})

describe('público: departamento masculino', () => {
  it('produto unissex que a loja também pôs em Homens continua unissex', () => {
    expect(audienceOf('Tônico do Crescimento Rapunzel', ['Todos'], ['/Cabelos/Tratamentos e Máscaras/', '/Cabelos/', '/Homens/', '/Homens/Cabelos/'])).toBe('unissex')
    expect(audienceOf('Pomada Efeito Seco', null, ['/Homem/Cabelos Masculinos/'])).toBe('masculino')
  })
})
