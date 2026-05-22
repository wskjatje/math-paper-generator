FROM public.ecr.aws/docker/library/python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
EXPOSE 8103
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8103"]
