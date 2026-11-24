-- Capilário | clima de cada momento (umidade e temperatura do ar)
--
-- Cabelo ondulado e cacheado muda muito com a umidade: com os mesmos produtos, um dia úmido
-- dá mais frizz. O app pega a localização do aparelho, consulta o clima daquela hora (Open-Meteo)
-- e grava só os números aqui. A localização não é guardada.

alter table public.stages
  add column humidity smallint check (humidity is null or humidity between 0 and 100),
  add column temperature numeric(4, 1) check (temperature is null or temperature between -60 and 60),
  add column weather_code smallint check (weather_code is null or weather_code between 0 and 99),
  -- Hora (UTC) a que o clima se refere: se a pessoa muda o horário do momento, o app consulta de novo.
  add column weather_at timestamptz;

-- A pessoa grava o clima dos próprios momentos (a política stages_update_own já limita às linhas dela).
grant update (humidity, temperature, weather_code, weather_at) on public.stages to authenticated;
