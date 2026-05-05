.PHONY: validate install

PYTHON := .venv/bin/python

install:
	python3 -m venv .venv
	$(PYTHON) -m pip install -r requirements.txt

validate:
	@if [ -x $(PYTHON) ]; then $(PYTHON) scripts/validate_all.py; else python3 scripts/validate_all.py; fi
